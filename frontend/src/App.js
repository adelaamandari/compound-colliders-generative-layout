import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Edges, Line } from '@react-three/drei';
import ForceGraph2D from 'react-force-graph-2d';
import html2canvas from 'html2canvas';
import UNIT_WALLS from './unitWalls';

// ============================================
// CONSTANTS & CONFIG
// ============================================
const GRID_SIZE = 20;
const SUBGRID_SIZE = 20; // Exactly 1x1m internal snapping
const CAMERA_SETTINGS = { position: [0, 80, 80], fov: 40 };
const PIXELS_PER_METER = 20;
const FLOOR_TO_FLOOR_HEIGHT = 3.0;
// Green areas / gardens render as a thin 20cm green ground plane (vs. the 3m walls),
// well under one storey so they never project as a void onto floors added above them.
const GREEN_AREA_HEIGHT = 0.2;
const LONDON_LATITUDE = 51.5074 * (Math.PI / 180);

// ============================================
// PROGRAMME FLOOR HEIGHTS & TYPES
// ============================================
const DOUBLE_HEIGHT_ROOMS = ["Lobby", "Library", "Mini Cinema", "Garden", "3 Bedroom", "4 Bedroom"];

function getRoomIsDoubleHeight(category) {
  const name = (category || '').split(' - ')[1] || category;
  return DOUBLE_HEIGHT_ROOMS.includes(name);
}

const PROGRAMME_FLOOR_HEIGHT = {
  "Lobby": 6.0, "Library": 6.0, "Mini Cinema": 6.0, "Garden": 6.0, "Multipurpose Hall": 6.0,
  "Gym": 3.0, "Events Room": 3.0, "Indoor Play Area": 3.0,
  "Core": 3.0, "Stairs": 3.0, "Corridor": 3.0,
  "Outdoor Playground": 3.0, "Shared Living Room": 3.0, "Shared Kitchen": 3.0,
  "Game Room": 3.0, "Workspace Room": 3.0, "Meeting Room": 3.0, "Concentration Pod": 3.0,
  "Studio": 3.0, "1 Bedroom": 3.0, "2 Bedroom": 3.0, 
  "3 Bedroom": 6.0, "4 Bedroom": 6.0,
};
const DEFAULT_FLOOR_HEIGHT = 3.0;

function getRoomFloorHeight(category) {
  const name = (category || '').split(' - ')[1] || category;
  return PROGRAMME_FLOOR_HEIGHT[name] || DEFAULT_FLOOR_HEIGHT;
}

const PROGRAMME_STRUCT_TYPE = {
  "Core": "C4", "Stairs": "C4", "Corridor": "C2A", "Lobby": "C4",
  "Multipurpose Hall": "C4", "Mini Cinema": "C3", "Gym": "C4",
  "Events Room": "C3", "Indoor Play Area": "C3",
  "Garden": "C2B", "Outdoor Playground": "C2B",
  "Shared Living Room": "C3", "Shared Kitchen": "C2B",
  "Game Room": "C2A", "Library": "C2A",
  "Workspace Room": "C2A", "Meeting Room": "C2A", "Concentration Pod": "C1",
  "Studio": "C1", "1 Bedroom": "C1", "2 Bedroom": "C1",
  "3 Bedroom": "C2A", "4 Bedroom": "C2A",
};

function getRoomStructType(category) {
  const name = (category || '').split(' - ')[1] || category;
  return PROGRAMME_STRUCT_TYPE[name] || 'C1';
}

// Monochrome (greys + white) palette with maroon-red accents for emphasis.
const COLORS = {
  bgDark: '#f1f3f5', bgMedium: '#e4e7ea', bgLight: '#ffffff',
  borderDark: '#b9bfc5', borderMedium: '#d3d8dd', borderLight: '#eaedf0',
  textPrimary: '#23282d', textSecondary: '#5f676e', textTertiary: '#969da4',
  accent: '#4f1717', accentDark: '#360f0f',
};

const getSemanticColor = (category) => {
  if (!category) return '#bdbab5';
  const cat = category.toLowerCase();
  if (cat.includes('green') || cat.includes('garden') || cat.includes('playground')) return '#7d8a6a';
  if (cat.includes('core') || cat.includes('lobby')) return '#9a9690';
  if (cat.includes('residential')) return '#6e2424';
  if (cat.includes('public') || cat.includes('buffer')) return '#b0746c';
  if (cat.includes('private communal')) return '#6a665f';
  if (cat.includes('corridor')) return '#cfccc6';
  return '#bdbab5';
};

// Floor display label: first floor is the Ground Floor, then Floor 1, 2, 3...
const floorLabel = (n) => (n === 1 ? 'Ground Floor' : `Floor ${n - 1}`);

// Ray-casting point-in-polygon test (polygon = array of [x, y] in pixels).
function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

const getShortNodeName = (category, floor) => {
  const name = category.split(' - ')[1] || category;
  return `${name.replace(/\s+/g, '_')}_L${floor}`;
};

// ============================================
// BOUNDARY ORTHOGONAL ALIGNMENT
// ============================================
const alignPolygonToOrthogonal = (polygon) => {
  if (!polygon || polygon.length === 0) return { rotatedPoly: [], angle: 0, cx: 0, cy: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
  
  let maxLength = 0;
  let angle = 0;
  
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length > maxLength) {
      maxLength = length;
      angle = Math.atan2(dy, dx);
    }
  }
  
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;

  const cx = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length;
  const cy = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;

  const rotatedPoly = polygon.map(p => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const rx = Math.cos(-angle) * dx - Math.sin(-angle) * dy + cx;
    const ry = Math.sin(-angle) * dx + Math.cos(-angle) * dy + cy;
    return [rx, ry];
  });

  const minX = Math.min(...rotatedPoly.map(p => p[0]));
  const maxX = Math.max(...rotatedPoly.map(p => p[0]));
  const minY = Math.min(...rotatedPoly.map(p => p[1]));
  const maxY = Math.max(...rotatedPoly.map(p => p[1]));

  return { rotatedPoly, angle, cx, cy, minX, maxX, minY, maxY };
};

const processBoundary = (baseBoundary) => {
  const poly = baseBoundary.metadata.polygon_pixels || [];
  const aligned = alignPolygonToOrthogonal(poly);
  return {
    ...baseBoundary,
    minX: aligned.minX, maxX: aligned.maxX,
    minY: aligned.minY, maxY: aligned.maxY,
    metadata: {
       ...baseBoundary.metadata,
       original_polygon_pixels: poly,
       polygon_pixels: aligned.rotatedPoly,
       alignment_angle: aligned.angle,
       alignment_centroid: [aligned.cx, aligned.cy]
    }
  };
};

const calculateOptimalZoom = (boundary) => {
  if (!boundary) return { zoom: 1, pan: { x: 0, y: 0 } };
  const canvas = document.getElementById('canvas-container');
  const canvasWidth  = canvas ? canvas.clientWidth  : 1000;
  const canvasHeight = canvas ? canvas.clientHeight : 800;
  const boundaryWidth  = boundary.maxX - boundary.minX;
  const boundaryHeight = boundary.maxY - boundary.minY;
  if (boundaryWidth === 0 || boundaryHeight === 0) return { zoom: 1, pan: { x: 0, y: 0 } };
  const padding = 120;
  const optimalZoom = Math.min(
    (canvasWidth  - padding * 2) / boundaryWidth,
    (canvasHeight - padding * 2) / boundaryHeight,
    2.0
  );
  const panX = canvasWidth  / 2 - (boundary.minX + boundaryWidth  / 2) * optimalZoom;
  const panY = canvasHeight / 2 - (boundary.minY + boundaryHeight / 2) * optimalZoom;
  return { zoom: optimalZoom, pan: { x: panX, y: panY } };
};

function pixelsToMeters(pixels) {
  return (pixels / PIXELS_PER_METER).toFixed(2);
}

function getLondonSolarPosition(month, hour) {
  const dayOfYear = (month - 1) * 30 + 15;
  const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * (Math.PI / 180)) * (Math.PI / 180);
  const hourAngle = 15 * (hour - 12) * (Math.PI / 180);
  const sinAlt = Math.sin(LONDON_LATITUDE) * Math.sin(declination) + Math.cos(LONDON_LATITUDE) * Math.cos(declination) * Math.cos(hourAngle);
  const altitude = Math.asin(sinAlt);
  
  let cosAz = (Math.sin(declination) - Math.sin(LONDON_LATITUDE) * Math.sin(altitude)) / (Math.cos(LONDON_LATITUDE) * Math.cos(altitude));
  cosAz = Math.max(-1, Math.min(1, cosAz)); 
  let azimuth = Math.acos(cosAz);
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;

  const radius = 150;
  const x = radius * Math.cos(altitude) * Math.sin(azimuth);
  const z = radius * Math.cos(altitude) * Math.cos(azimuth) * -1; 
  const y = radius * Math.sin(altitude);

  return { x, y: Math.max(y, -5), z, isDaylight: altitude > 0 };
}

// ============================================
// CATALOG DATA (Precise 1x1m Mapping)
// ============================================
// Footprints traced from the uploaded unit plans. All grids are integer
// metres (1 cell = 1m), so gw*gh (minus notches) equals area in m².
const CATALOG_DATA = {
  // Residential shapePaths are the rectangular footprint of each unit's wall shell
  // (from rooms_massing.json) so the 2D plan matches the 3D wall panels and rotates
  // identically. True concave outlines aren't recoverable from the export (door gaps).
  "Studio": [
    // Studio_A (rooms_massing): 10x4, 40m²
    { opt: "Layout A", area: 40, score: 0.95, path: "0,0 100,0 100,100 0,100", variant: 0, gw: 10, gh: 4 },
    // Studio_B (rooms_massing): 6x8, 48m²
    { opt: "Layout B", area: 48, score: 0.90, path: "0,0 100,0 100,100 0,100", variant: 1, gw: 6, gh: 8 },
  ],
  "1 Bedroom": [
    // 1Bed_A (rooms_massing): 10x6, 60m²
    { opt: "Layout A", area: 60, score: 0.94, path: "0,0 100,0 100,100 0,100", variant: 0, gw: 10, gh: 6 },
    // 1Bed_B (rooms_massing): 8x7, 56m²
    { opt: "Layout B", area: 56, score: 0.92, path: "0,0 100,0 100,100 0,100", variant: 1, gw: 8, gh: 7 },
  ],
  "2 Bedroom": [
    // 2Bed_A (rooms_massing): 11x6, 66m²
    { opt: "Layout A", area: 66, score: 1.00, path: "0,0 100,0 100,100 0,100", variant: 0, gw: 11, gh: 6 },
    // 2Bed_B (rooms_massing): 10x6, 60m²
    { opt: "Layout B", area: 60, score: 0.93, path: "0,0 100,0 100,100 0,100", variant: 1, gw: 10, gh: 6 },
  ],
  "3 Bedroom": [
    // 3Bed_A (rooms_massing): 9x6, 54m², double-height (6m); rectangle
    { opt: "Layout A", area: 54, score: 0.96, path: "0,0 100,0 100,100 0,100", variant: 0, gw: 9, gh: 6 },
    // 3Bed_B (rooms_massing): 11x5, 55m², double-height (6m); rectangle
    { opt: "Layout B", area: 55, score: 0.89, path: "0,0 100,0 100,100 0,100", variant: 1, gw: 11, gh: 5 },
  ],
  "4 Bedroom": [
    // 4Bed_A (rooms_massing): 11x7, 77m², double-height (6m); rectangle
    { opt: "Layout A", area: 77, score: 0.95, path: "0,0 100,0 100,100 0,100", variant: 0, gw: 11, gh: 7 },
    // 4Bed_B (rooms_massing): 9x7, 63m², double-height (6m); rectangle
    { opt: "Layout B", area: 63, score: 0.90, path: "0,0 100,0 100,100 0,100", variant: 1, gw: 9, gh: 7 },
  ],
};

const COMMUNAL_GW_GH = {
  "Core":               { gw: 6,  gh: 6,    path: "0,0 100,0 100,100 0,100" },
  "Lobby":              { gw: 9,  gh: 9,    path: "0,0 100,0 100,100 0,100" },
  "Stairs":             { gw: 3,  gh: 6,    path: "0,0 100,0 100,100 0,100" },
  "Corridor":           { gw: 3,  gh: 15,   path: "0,0 100,0 100,100 0,100" },
  "Shared Kitchen":     { gw: 12, gh: 3,    path: "0,0 100,0 100,100 0,100" },
  "Shared Living Room": { gw: 9,  gh: 6,    path: "0,0 100,0 100,100 0,100" },
  "Game Room":          { gw: 6,  gh: 3,    path: "0,0 100,0 100,100 0,100" },
  "Library":            { gw: 6,  gh: 6,    path: "0,50 50,50 50,0 100,0 100,100 0,100", areaFactor: 0.75 },
  "Workspace Room":     { gw: 6,  gh: 6,    path: "0,0 50,0 50,50 100,50 100,100 0,100", areaFactor: 0.75 },
  "Meeting Room":       { gw: 3,  gh: 3,    path: "0,0 100,0 100,100 0,100" },
  "Concentration Pod":  { gw: 3,  gh: 1.5,  path: "0,0 100,0 100,100 0,100" },
  "Multipurpose Hall":  { gw: 12, gh: 6,    path: "0,0 100,0 100,100 0,100" },
  "Mini Cinema":        { gw: 9,  gh: 6,    path: "0,0 100,0 100,100 0,100" },
  "Gym":                { gw: 12, gh: 3,    path: "0,0 100,0 100,100 0,100" },
  "Events Room":        { gw: 9,  gh: 3,    path: "0,0 100,0 100,100 0,100" },
  "Indoor Play Area":   { gw: 6,  gh: 6,    path: "0,0 100,0 100,100 0,100" },
  "Garden":             { gw: 15, gh: 3,    path: "0,0 100,0 100,100 0,100" },
  "Outdoor Playground": { gw: 15, gh: 3,    path: "0,0 100,0 100,100 0,100" },
};

const communalComponents = {
  "Circulation":       ["Lobby", "Core", "Stairs", "Corridor"],
  "Private Communal":  ["Shared Living Room", "Shared Kitchen", "Game Room", "Library", "Workspace Room", "Meeting Room", "Concentration Pod"],
  "Public Buffer Zone":["Garden", "Outdoor Playground", "Multipurpose Hall", "Mini Cinema", "Gym", "Events Room", "Indoor Play Area"]
};

const residentialComponents = ["Studio", "1 Bedroom", "2 Bedroom", "3 Bedroom", "4 Bedroom"];

// ============================================
// 3D COMPONENTS
// ============================================
const SceneCapturer = ({ sceneRef }) => {
  const { scene } = useThree();
  useEffect(() => { sceneRef.current = scene; }, [scene, sceneRef]);
  return null;
};

const Boundary3D = ({ boundary, scale }) => {
  const poly = boundary?.metadata?.polygon_pixels;
  if (!poly || poly.length === 0) return null;
  const cx = boundary.metadata.alignment_centroid[0];
  const cy = boundary.metadata.alignment_centroid[1];
  return (
    <group>
      {poly.map((point, i) => {
        const next = poly[(i + 1) % poly.length];
        return (
          <Line key={`b-${i}`}
            points={[
              [(point[0] - cx) / scale, 0, (point[1] - cy) / scale],
              [(next[0]  - cx) / scale, 0, (next[1]  - cy) / scale],
            ]}
            color="#0056b3" lineWidth={2}
          />
        );
      })}
    </group>
  );
};

// Map a residential category + shape variant to a rooms_massing unit key (e.g. "3Bed_B").
const UNIT_WALL_ABBR = {
  "Studio": "Studio", "1 Bedroom": "1Bed", "2 Bedroom": "2Bed",
  "3 Bedroom": "3Bed", "4 Bedroom": "4Bed",
};
function getUnitWallKey(category, variant) {
  const name = (category || '').split(' - ')[1];
  const ab = UNIT_WALL_ABBR[name];
  if (!ab) return null;
  return `${ab}_${variant === 1 ? 'B' : 'A'}`;
}

const WALL_THICKNESS = 0.12; // m — visual thickness of a 1m panel

// Renders a residential unit as panelised 1m wall segments (hollow shell + interior
// partitions) using the data exported in unitWalls.js, instead of a solid block.
const WallPanels = ({ unit, w, d, flipX, color, shapePath }) => {
  const FLOOR_T = 0.12; // thin floor slab thickness (m)
  const isDoubleHeight = (unit.size?.[2] || 3) >= 6;
  // Floor plate follows the unit's footprint outline (shapePath), not a full bbox box.
  const floorShape = useMemo(() => {
    const path = shapePath || '0,0 100,0 100,100 0,100';
    const pts = path.trim().split(' ').map(p => {
      const [px, py] = p.split(',');
      let lx = (parseFloat(px) / 100 - 0.5) * w;
      const ly = -(parseFloat(py) / 100 - 0.5) * d;
      if (flipX) lx = -lx;
      return new THREE.Vector2(lx, ly);
    });
    return new THREE.Shape(pts);
  }, [shapePath, w, d, flipX]);
  const floorMat = <meshStandardMaterial color="#c9c4bc" roughness={0.9} />;
  return (
    <group>
      {/* thin floor plate shaped to the outline (and a mezzanine plate for double-height) */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <extrudeGeometry args={[floorShape, { depth: FLOOR_T, bevelEnabled: false }]} />
        {floorMat}
      </mesh>
      {isDoubleHeight && (
        <mesh position={[0, 0, 3]} receiveShadow>
          <extrudeGeometry args={[floorShape, { depth: FLOOR_T, bevelEnabled: false }]} />
          <meshStandardMaterial color="#c9c4bc" roughness={0.9} />
        </mesh>
      )}
      {unit.walls.map((p, i) => {
        const [sx, sy, sz] = p.s;
        const [gx, gy, gz] = p.o;
        const dx = Math.max(sx, WALL_THICKNESS);
        const dy = Math.max(sy, WALL_THICKNESS);
        const dz = Math.max(sz, WALL_THICKNESS);
        // unit-local grid -> mesh-local frame (matches the solid extrude convention)
        let cxl = (gx + sx / 2) - w / 2;
        const cyl = d / 2 - (gy + sy / 2);
        const czl = gz + sz / 2;
        if (flipX) cxl = -cxl;
        return (
          <mesh key={i} position={[cxl, cyl, czl]} castShadow receiveShadow>
            <boxGeometry args={[dx, dy, dz]} />
            <meshStandardMaterial color={color} transparent opacity={0.85} roughness={0.4} />
            <Edges scale={1} threshold={15} color="white" />
          </mesh>
        );
      })}
    </group>
  );
};

// 2D plan overlay: draws a residential unit's 1m wall segments inside its room box so the
// floor plan shows the same partition layout as the 3D shell. Shares the polygon's
// flip/rotate transform so it stays aligned under rotation.
const WallPlan2D = ({ room }) => {
  if (!(room.category || '').startsWith('Residential Unit')) return null;
  const key = getUnitWallKey(room.category, room.shapeVariant);
  const unit = key ? UNIT_WALLS[key] : null;
  if (!unit) return null;
  const [w, d] = unit.size;
  return (
    <g style={{ transformOrigin: '50% 50%', transform: `scaleX(${room.flipX ? -1 : 1}) rotate(${room.rotation}deg)` }}>
      {unit.walls.filter(p => p.s[2] >= 2).map((p, i) => {
        const [sx, sy] = p.s;
        const [gx, gy] = p.o;
        const x1 = (gx / w) * 100, y1 = (gy / d) * 100;
        const x2 = ((gx + sx) / w) * 100, y2 = ((gy + sy) / d) * 100;
        if (sx > 0 && sy > 0) {
          return <rect key={i} x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill={room.borderColor} opacity={0.55} />;
        }
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={room.borderColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
      })}
    </g>
  );
};

const ModularMesh = ({ room, scale, boundary }) => {
  const isRotated = room.rotation % 180 !== 0;
  const unrotatedWidth  = isRotated ? room.height : room.width;
  const unrotatedHeight = isRotated ? room.width  : room.height;

  const w = unrotatedWidth  / scale;
  const d = unrotatedHeight / scale;
  const h = room.floor_height || getRoomFloorHeight(room.category);

  const cx = boundary?.metadata?.alignment_centroid?.[0] || 400;
  const cy = boundary?.metadata?.alignment_centroid?.[1] || 300;

  const x = (room.x + room.width  / 2 - cx) / scale;
  const z = (room.y + room.height / 2 - cy) / scale;

  const y = (room.floor - 1) * FLOOR_TO_FLOOR_HEIGHT;

  // Residential units with exported wall data render as panelised shells.
  const isResidential = (room.category || '').startsWith('Residential Unit');
  const wallKey = isResidential ? getUnitWallKey(room.category, room.shapeVariant) : null;
  const unitWalls = wallKey ? UNIT_WALLS[wallKey] : null;

  const shape = useMemo(() => {
    const path = room.shapePath || "0,0 100,0 100,100 0,100";
    const pts = path.trim().split(' ').map(p => {
      const [px, py] = p.split(',');
      let lx = (parseFloat(px) / 100 - 0.5) * w;
      let ly = -(parseFloat(py) / 100 - 0.5) * d;
      if (room.flipX) lx = -lx;
      return new THREE.Vector2(lx, ly);
    });
    return new THREE.Shape(pts);
  }, [room.shapePath, w, d, room.flipX]);

  const geomKey = `${room.id}-${room.shapeVariant}-${room.rotation}-${room.flipX}-${room.width}-${room.height}-${h}`;

  // Residential units with exported wall data render as panelised shells.
  if (unitWalls) {
    return (
      <group
        position={[x, y, z]}
        rotation={[-Math.PI / 2, 0, -(room.rotation * Math.PI) / 180]}
        name={room.category}
      >
        <WallPanels unit={unitWalls} w={w} d={d} flipX={room.flipX} color={room.borderColor} shapePath={room.shapePath} />
      </group>
    );
  }

  return (
    <mesh
      position={[x, y, z]}
      rotation={[-Math.PI / 2, 0, -(room.rotation * Math.PI) / 180]}
      name={room.category}
      castShadow
      receiveShadow
    >
      <extrudeGeometry key={geomKey} args={[shape, { depth: h, bevelEnabled: false }]} />
      <meshStandardMaterial color={room.borderColor} transparent opacity={0.85} roughness={0.3} />
      <Edges scale={1} threshold={15} color="white" />
    </mesh>
  );
};

const roomLabelContainerStyle = {
  position: 'absolute', top: 0, left: 0,
  width: '100%', height: '100%',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  color: 'white', pointerEvents: 'none',
  zIndex: 1, textAlign: 'center',
  padding: '5px', boxSizing: 'border-box', wordBreak: 'break-word'
};

const getCalculatedRoomAreaM2 = (roomWidth, roomHeight, roomName, communalGwGh, gridSize) => {
  const metrics = communalGwGh[roomName] || { areaFactor: 1 };
  const factor  = metrics.areaFactor || 1;
  return Math.round((roomWidth / gridSize) * (roomHeight / gridSize) * factor);
};

// ============================================
// MAIN APP
// ============================================
function App() {
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  const [rooms,               setRooms]               = useState([]);
  const [rules,               setRules]               = useState([]);
  const [floors,              setFloors]              = useState([1]);
  const [activeFloor,         setActiveFloor]         = useState(1);
  const [activeCatalogContext,setActiveCatalogContext] = useState(null);
  const [catalogAnchorTop,    setCatalogAnchorTop]    = useState(120);
  const [history,             setHistory]             = useState([[]]);
  const [historyStep,         setHistoryStep]         = useState(0);
  const [targetUser,          setTargetUser]          = useState('Mix');
  const [population,          setPopulation]          = useState(15);
  const [isCalculating,       setIsCalculating]       = useState(false);
  const [viewMode,            setViewMode]            = useState('2D');
  const [selectedRoomId,      setSelectedRoomId]      = useState(null);
  const [exportMenu,          setExportMenu]          = useState({ visible: false, x: 0, y: 0, imageData: null, fileName: '' });

  const [solarMonth, setSolarMonth] = useState(6); 
  const [solarHour, setSolarHour] = useState(14);  

  const [siteBoundary, setSiteBoundary] = useState(() => processBoundary({
    type: "Polygon",
    name: "Imported Boundary JSON",
    gridSize: 20,
    metadata: {
      original_area_m2: 1499,
      grid_cell_size_m: 2,
      polygon_pixels: [
        [894, 1188],[389, 1232],[150, 371],
        [301, 261],[761, 150],[939, 893],
        [863, 914],[847, 959],[848, 1012]
      ]
    }
  }));

  const [canvasZoom,       setCanvasZoom]       = useState(1);
  const [canvasPan,        setCanvasPan]        = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStartPos,     setDragStartPos]     = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (viewMode === '2D') {
      setTimeout(() => {
        const { zoom, pan } = calculateOptimalZoom(siteBoundary);
        setCanvasZoom(zoom);
        setCanvasPan(pan);
      }, 100);
    }
  }, [viewMode, siteBoundary]);

  const sceneRef = useRef();
  const fgRef    = useRef();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement?.tagName.toLowerCase() === 'input') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRoomId) {
        const roomToDelete = rooms.find(r => r.id === selectedRoomId);
        if (roomToDelete && !roomToDelete.pinned) {
          updateRoomsWithHistory(rooms.filter(r => r.id !== selectedRoomId));
          setSelectedRoomId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rooms, selectedRoomId, history, historyStep]);

  const graphData = useMemo(() => {
    const validRoomIds = new Set(rooms.map(r => r.id));
    const nodes = rooms.map(r => ({
      id:    r.id,
      name:  getShortNodeName(r.category, r.floor),
      color: getSemanticColor(r.category),
      val:   Math.max(18, Math.sqrt(r.width * r.height) / 8),
      floor: r.floor
    }));
    const links = rules
      .filter(rule => validRoomIds.has(rule.source) && validRoomIds.has(rule.target))
      .map(rule => ({ source: rule.source, target: rule.target, weight: rule.weight }));
    return { nodes, links };
  }, [rooms, rules]);

  useEffect(() => {
    if (fgRef.current && viewMode === 'GRAPH') {
      fgRef.current.d3Force('charge').strength(-800);
      fgRef.current.d3Force('link').distance(120);
    }
  }, [viewMode, graphData]);

  const handleRightClickExport = async (e, viewModeStr, floorNum = 1) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    document.body.style.cursor = 'wait';
    try {
      let dataUrl = null;
      let filename = '';
      if (viewModeStr === 'GRAPH') {
        const canvas = document.getElementById('view-graph')?.querySelector('canvas');
        if (canvas) { dataUrl = canvas.toDataURL('image/png'); filename = 'Graph_Topology_View.png'; }
      } else if (viewModeStr === '3D') {
        const canvas = document.getElementById('view-3d')?.querySelector('canvas');
        if (canvas) { dataUrl = canvas.toDataURL('image/png'); filename = '3D_Massing_View.png'; }
      } else if (viewModeStr === '2D') {
        const element = document.getElementById(`view-2d-${floorNum}`);
        if (element) {
          element.querySelectorAll('.no-export').forEach(el => el.style.display = 'none');
          setSelectedRoomId(null);
          const canvas = await html2canvas(element, { backgroundColor: COLORS.bgLight, useCORS: true });
          element.querySelectorAll('.no-export').forEach(el => el.style.display = '');
          dataUrl = canvas.toDataURL('image/png');
          filename = `2D_Plan_Floor_${floorNum}.png`;
        }
      }
      if (dataUrl) setExportMenu({ visible: true, x: e.clientX, y: e.clientY, imageData: dataUrl, fileName: filename });
    } catch (err) {
      console.error("Failed to export PNG", err);
    } finally {
      document.body.style.cursor = 'default';
    }
  };

  const handleWheel = (e) => {
    const delta    = -e.deltaY * 0.001;
    const newZoom  = Math.max(0.1, Math.min(canvasZoom * (1 + delta), 4.0));
    const rect     = e.currentTarget.getBoundingClientRect();
    const mouseX   = e.clientX - rect.left;
    const mouseY   = e.clientY - rect.top;
    const ratio    = newZoom / canvasZoom;
    setCanvasZoom(newZoom);
    setCanvasPan({ x: mouseX - (mouseX - canvasPan.x) * ratio, y: mouseY - (mouseY - canvasPan.y) * ratio });
  };

  const handleZoomStep = (zoomIn) => {
    const canvas = document.getElementById('canvas-container');
    if (!canvas) return;
    const { width, height } = canvas.getBoundingClientRect();
    const newZoom  = Math.max(0.1, Math.min(canvasZoom + (zoomIn ? 0.2 : -0.2), 4.0));
    const ratio    = newZoom / canvasZoom;
    setCanvasZoom(newZoom);
    setCanvasPan({
      x: width  / 2 - (width  / 2 - canvasPan.x) * ratio,
      y: height / 2 - (height / 2 - canvasPan.y) * ratio,
    });
  };

  const handleCanvasMouseDown = (e) => {
    if (e.target.id === 'canvas-background' || e.target.id === 'canvas-svg' || e.target.tagName.toLowerCase() === 'svg') {
      setIsDraggingCanvas(true);
      setDragStartPos({ x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y });
      setSelectedRoomId(null);
    }
  };

  const handleCanvasMouseMove  = (e) => { if (isDraggingCanvas) setCanvasPan({ x: e.clientX - dragStartPos.x, y: e.clientY - dragStartPos.y }); };
  const handleCanvasMouseUpOrLeave = () => setIsDraggingCanvas(false);

  const updateRoomsWithHistory = (newRooms) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newRooms);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
    setRooms(newRooms);
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      setHistoryStep(historyStep - 1);
      setRooms(history[historyStep - 1]);
      setRules([]); setSelectedRoomId(null);
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      setHistoryStep(historyStep + 1);
      setRooms(history[historyStep + 1]);
      setRules([]); setSelectedRoomId(null);
    }
  };

  const handleAddFloor = () => {
    const nextFloor = floors.length > 0 ? Math.max(...floors) + 1 : 1;
    setFloors([...floors, nextFloor]);
    setActiveFloor(nextFloor);
    
    const circRooms = rooms.filter(r => 
        r.floor === floors[0] && 
        (r.category.includes('Core') || r.category.includes('Stairs'))
    );

    const cloned = circRooms.map(r => ({
      ...r,
      id: `${r.id.split(' ')[0]} (${Math.floor(Math.random() * 10000)})`,
      floor: nextFloor
    }));
    updateRoomsWithHistory([...rooms, ...cloned]);
  };

  const handleDeleteFloor = (floorToDelete) => {
    if (floors.length === 1) return alert("You must have at least one floor.");
    setFloors(floors.filter(f => f !== floorToDelete));
    updateRoomsWithHistory(rooms.filter(r => r.floor !== floorToDelete));
    if (activeFloor === floorToDelete) setActiveFloor(floors[0]);
  };

  const handlePinFloor   = (floorNum, pinState) => updateRoomsWithHistory(rooms.map(r => r.floor === floorNum ? { ...r, pinned: pinState } : r));
  const handleResetFloor = (floorNum)            => updateRoomsWithHistory(rooms.filter(r => r.floor !== floorNum));

  const createRoomObject = (categoryName, itemName, customData, roomIndex) => {
    const isResidential = categoryName === "Residential Unit";
    const communalType  = Object.keys(communalComponents).find(key => communalComponents[key].includes(itemName)) || "Private Communal";
    const fullCategory  = isResidential ? `${categoryName} - ${itemName}` : `${communalType} - ${itemName}`;

    let startWidth, startHeight, shapePath, variant, optName, calculatedArea;

    if (customData) {
      startWidth = customData.gw * GRID_SIZE; startHeight = customData.gh * GRID_SIZE;
      shapePath = customData.path; variant = customData.variant;
      optName = customData.opt; calculatedArea = customData.area;
    } else if (isResidential) {
      const catalogItem = CATALOG_DATA[itemName]?.[0];
      startWidth  = (catalogItem?.gw || 6) * GRID_SIZE;
      startHeight = (catalogItem?.gh || 6) * GRID_SIZE;
      shapePath   = catalogItem?.path || "0,0 100,0 100,100 0,100";
      variant     = catalogItem?.variant || 0;
      optName     = catalogItem?.opt || "Custom";
      calculatedArea = catalogItem?.area || getCalculatedRoomAreaM2(startWidth, startHeight, itemName, COMMUNAL_GW_GH, GRID_SIZE);
    } else {
      const communalDims = COMMUNAL_GW_GH[itemName] || { gw: 6, gh: 6, path: "0,0 100,0 100,100 0,100" };
      startWidth  = communalDims.gw * GRID_SIZE;
      startHeight = communalDims.gh * GRID_SIZE;
      shapePath   = communalDims.path || "0,0 100,0 100,100 0,100";
      variant = 0; optName = null;
      calculatedArea = getCalculatedRoomAreaM2(startWidth, startHeight, itemName, COMMUNAL_GW_GH, GRID_SIZE);
    }

    const colorMap = {
      'Residential Unit':  { bg: 'rgba(110, 36, 36, 0.38)',  border: '#6e2424' },
      'Circulation':       { bg: 'rgba(154, 150, 144, 0.30)', border: '#9a9690' },
      'Private Communal':  { bg: 'rgba(106, 102, 95, 0.30)',  border: '#6a665f' },
      'Public Buffer Zone':{ bg: 'rgba(176, 116, 108, 0.32)', border: '#b0746c' },
      'Green Area':        { bg: 'rgba(125, 138, 106, 0.35)', border: '#7d8a6a' }
    };
    const category = isResidential ? 'Residential Unit' : communalType;
    // Garden & Outdoor Playground are outdoor green spaces: render green + flat, like green areas.
    const isGreenSpace = itemName === 'Garden' || itemName === 'Outdoor Playground';
    let { bg, border } = colorMap[category] || { bg: 'rgba(120,116,110,0.3)', border: '#8a857e' };
    if (isGreenSpace) { bg = colorMap['Green Area'].bg; border = colorMap['Green Area'].border; }

    const cx = siteBoundary?.metadata?.alignment_centroid?.[0] || 400;
    const cy = siteBoundary?.metadata?.alignment_centroid?.[1] || 300;

    return {
      id:               `${itemName} (${Math.floor(Math.random() * 10000)})`,
      category:         fullCategory,
      floor:            activeFloor,
      x:                Math.round((cx - 150 + (roomIndex % 4) * 80) / SUBGRID_SIZE) * SUBGRID_SIZE,
      y:                Math.round((cy - 150 + Math.floor(roomIndex / 4) * 80) / SUBGRID_SIZE) * SUBGRID_SIZE,
      width:            startWidth,
      height:           startHeight,
      bgColor:          bg,
      borderColor:      border,
      shapePath,
      shapeVariant:     variant,
      optName,
      score:            customData ? customData.score : null,
      area:             calculatedArea,
      rotation:         0,
      flipX:            false,
      pinned:           false,
      floor_height:     isGreenSpace ? GREEN_AREA_HEIGHT : getRoomFloorHeight(fullCategory),
      struct_type:      getRoomStructType(fullCategory)
    };
  };

  const handleAddRoom = (categoryName, itemName) => {
    updateRoomsWithHistory([...rooms, createRoomObject(categoryName, itemName, null, rooms.length)]);
  };

  const handleAddCatalogRoom = (categoryName, itemName, catalogItem) => {
    updateRoomsWithHistory([...rooms, createRoomObject(categoryName, itemName, catalogItem, rooms.length)]);
    setActiveCatalogContext(null);
  };

  const handleAutoPopulate = () => {
    setRules([]);
    let remainingPop = parseInt(population, 10);
    if (isNaN(remainingPop) || remainingPop <= 0) return;

    const newRooms = [];
    let spawnIdx = rooms.length;
    const addRoom = (cat, item, custom = null) => { newRooms.push(createRoomObject(cat, item, custom, spawnIdx)); spawnIdx++; };
    const getRandomVariant = (name) => CATALOG_DATA[name][Math.floor(Math.random() * CATALOG_DATA[name].length)];

    // The Library is a double-height unit that spans 2 floors, so one library serves a
    // stacked pair of floors. Only add one if the floor directly below doesn't already
    // have a library projecting up into this floor.
    const libraryBelow = rooms.some(r => r.floor === activeFloor - 1 && (r.category || '').includes('Library'));
    const addLibraryOnce = () => { if (!libraryBelow) addRoom("Private Communal", "Library"); };

    if (activeFloor === 1) addRoom("Circulation", "Lobby");

    if (targetUser === 'Students') {
      const studioPop = Math.floor(remainingPop * 0.4);
      const fourBedPop = remainingPop - studioPop;
      for (let i = 0; i < Math.ceil(studioPop); i++)   addRoom("Residential Unit", "Studio",    getRandomVariant("Studio"));
      for (let i = 0; i < Math.ceil(fourBedPop / 4); i++) addRoom("Residential Unit", "4 Bedroom", getRandomVariant("4 Bedroom"));
    } else if (targetUser === 'Young Professional') {
      const sPop = Math.floor(remainingPop * 0.3);
      const oPop = Math.floor(remainingPop * 0.4);
      const tPop = remainingPop - sPop - oPop;
      for (let i = 0; i < Math.ceil(sPop); i++)       addRoom("Residential Unit", "Studio",    getRandomVariant("Studio"));
      for (let i = 0; i < Math.ceil(oPop / 2); i++)   addRoom("Residential Unit", "1 Bedroom", getRandomVariant("1 Bedroom"));
      for (let i = 0; i < Math.ceil(tPop / 3); i++)   addRoom("Residential Unit", "2 Bedroom", getRandomVariant("2 Bedroom"));
    } else if (targetUser === 'Family') {
      const tPop  = Math.floor(remainingPop * 0.4);
      const thPop = remainingPop - tPop;
      for (let i = 0; i < Math.ceil(tPop / 3); i++)   addRoom("Residential Unit", "2 Bedroom", getRandomVariant("2 Bedroom"));
      for (let i = 0; i < Math.ceil(thPop / 4); i++)  addRoom("Residential Unit", "3 Bedroom", getRandomVariant("3 Bedroom"));
    } else if (targetUser === 'Mix') {
      const sPop = Math.floor(remainingPop * 0.25);
      const oPop = Math.floor(remainingPop * 0.35);
      const tPop = Math.floor(remainingPop * 0.25);
      const thPop = remainingPop - sPop - oPop - tPop;
      for (let i = 0; i < Math.ceil(sPop); i++)       addRoom("Residential Unit", "Studio", getRandomVariant("Studio"));
      for (let i = 0; i < Math.ceil(oPop / 2); i++)   addRoom("Residential Unit", "1 Bedroom", getRandomVariant("1 Bedroom"));
      for (let i = 0; i < Math.ceil(tPop / 3); i++)   addRoom("Residential Unit", "2 Bedroom", getRandomVariant("2 Bedroom"));
      for (let i = 0; i < Math.ceil(thPop / 4); i++)  addRoom("Residential Unit", "3 Bedroom", getRandomVariant("3 Bedroom"));
      
      if (activeFloor === 1) {
        addRoom("Public Buffer Zone", "Multipurpose Hall");
        addRoom("Public Buffer Zone", "Garden");
        addRoom("Public Buffer Zone", "Mini Cinema");
      } else {
        addRoom("Private Communal", "Shared Kitchen");
        addRoom("Private Communal", "Workspace Room");
        addRoom("Private Communal", "Game Room");
      }
    }

    addRoom("Circulation", "Core");
    addRoom("Circulation", "Corridor");
    addRoom("Circulation", "Corridor");

    if (targetUser === 'Students') {
      addRoom("Private Communal", "Shared Kitchen"); addRoom("Private Communal", "Shared Living Room");
      addLibraryOnce();
    } else if (targetUser === 'Young Professional') {
      addLibraryOnce(); addRoom("Private Communal", "Concentration Pod"); addRoom("Private Communal", "Meeting Room");
    } else if (targetUser === 'Family') {
      addRoom("Private Communal", "Game Room"); addRoom("Private Communal", "Workspace Room");
    }

    updateRoomsWithHistory([...rooms, ...newRooms]);
  };

  // Fill leftover ground-floor space (inside the site boundary, not covered by any room)
  // with low green-area tiles. Scans a 2m grid and merges free cells into horizontal strips.
  const handleFillGreen = () => {
    const GF = 1;
    const cell = GRID_SIZE * 2; // 2m
    const poly = siteBoundary?.metadata?.polygon_pixels;
    const minX = Math.ceil(siteBoundary.minX), maxX = Math.floor(siteBoundary.maxX);
    const minY = Math.ceil(siteBoundary.minY), maxY = Math.floor(siteBoundary.maxY);
    const occ = rooms
      .filter(r => r.floor === GF && !(r.category || '').includes('Green'))
      .map(r => [r.x, r.y, r.width, r.height]);

    const inBounds = (x, y) => (poly && poly.length ? pointInPolygon(x, y, poly) : (x >= minX && y >= minY && x <= maxX && y <= maxY));
    const isFree = (x, y, w, h) => {
      const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]];
      if (!pts.every(([px, py]) => inBounds(px, py))) return false;
      return !occ.some(([ox, oy, ow, oh]) => !(x + w <= ox || ox + ow <= x || y + h <= oy || oy + oh <= y));
    };
    const makeGreen = (x, y, w, h) => ({
      id: `Green Area (${Math.floor(Math.random() * 100000)})`,
      category: 'Green Area - Garden', floor: GF, x, y, width: w, height: h,
      bgColor: 'rgba(125, 138, 106, 0.35)', borderColor: '#7d8a6a',
      shapePath: '0,0 100,0 100,100 0,100', shapeVariant: 0, optName: null, score: null,
      area: Math.round((w / GRID_SIZE) * (h / GRID_SIZE)),
      rotation: 0, flipX: false, pinned: true, floor_height: GREEN_AREA_HEIGHT, struct_type: 'C2B',
    });

    const greens = [];
    for (let y = minY; y + cell <= maxY; y += cell) {
      let runStart = null;
      for (let x = minX; x + cell <= maxX; x += cell) {
        const free = isFree(x, y, cell, cell);
        if (free && runStart === null) runStart = x;
        if (!free && runStart !== null) {
          if (x - runStart >= cell) greens.push(makeGreen(runStart, y, x - runStart, cell));
          runStart = null;
        }
      }
      if (runStart !== null) {
        const end = minX + Math.floor((maxX - minX) / cell) * cell;
        if (end - runStart >= cell) greens.push(makeGreen(runStart, y, end - runStart, cell));
      }
    }
    if (greens.length === 0) { alert("No leftover ground-floor space to fill."); return; }
    const without = rooms.filter(r => !((r.category || '').includes('Green') && r.floor === GF));
    updateRoomsWithHistory([...without, ...greens]);
  };

  const handleStraighten = async (shouldRandomize = false) => {
    if (rooms.length === 0) return;
    setIsCalculating(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/straighten-walls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUser, activeFloor, rooms, randomize: shouldRandomize, boundary: siteBoundary })
      });
      const data = await response.json();
      if (data.status === 'success') {
        const sortedRooms = data.rooms.sort((a, b) => a.floor - b.floor);
        setRooms(sortedRooms);
        setRules(data.rules);
        const maxFloor = Math.max(...data.rooms.map(r => r.floor));
        if (maxFloor > floors.length) setFloors(Array.from({ length: maxFloor }, (_, i) => i + 1));
      }
    } catch {
      alert("Backend error. Make sure Python server is running on http://127.0.0.1:8000");
    }
    setIsCalculating(false);
  };

  const handleUploadBoundary = () => document.getElementById('boundaryFile').click();

  const handleFileSelected = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/parse-void-boundary', { method: 'POST', body: formData });
      const data = await response.json();
      if (data.status === 'success') {
        const processed = processBoundary(data.boundary);
        setSiteBoundary(processed);
        const { zoom, pan } = calculateOptimalZoom(processed);
        setCanvasZoom(zoom); setCanvasPan(pan);
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error) {
      alert(`Upload failed: ${error.message}`);
    }
  };

  const handleDragStop = (room, e, d) => {
    if (room.pinned) return;
    const snapX = Math.round(d.x / SUBGRID_SIZE) * SUBGRID_SIZE;
    const snapY = Math.round(d.y / SUBGRID_SIZE) * SUBGRID_SIZE;
    updateRoomsWithHistory(rooms.map(r => r.id === room.id ? { ...r, x: snapX, y: snapY } : r));
  };

  const handleDrag = (draggedRoom, newX, newY) => {
    if (draggedRoom.pinned) return;
    setRooms(rooms.map(r => r.id === draggedRoom.id ? { ...r, x: newX, y: newY } : r));
  };

  const togglePin = (roomId) => updateRoomsWithHistory(rooms.map(r => r.id === roomId ? { ...r, pinned: !r.pinned } : r));

  const handleModifyShape = (roomId, action) => {
    const newRooms = rooms.map(r => {
      if (r.id !== roomId || r.pinned) return r;
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (action === 'ROTATE') {
        return { ...r, width: r.height, height: r.width, x: cx - r.height/2, y: cy - r.width/2, rotation: (r.rotation + 90) % 360 };
      } else if (action === 'FLIP') {
        return { ...r, flipX: !r.flipX };
      } else if (action === 'CYCLE_VARIANT') {
        const itemName = (r.category || "").split(' - ')[1];
        if (CATALOG_DATA[itemName]) {
          const currentCatalog = CATALOG_DATA[itemName];
          const currentIndex   = currentCatalog.findIndex(opt => opt.variant === r.shapeVariant);
          const nextOption     = currentCatalog[(currentIndex + 1) % currentCatalog.length];
          return {
            ...r,
            shapeVariant: nextOption.variant, shapePath: nextOption.path,
            optName: nextOption.opt, score: nextOption.score,
            width: nextOption.gw * GRID_SIZE, height: nextOption.gh * GRID_SIZE, area: nextOption.area
          };
        }
      }
      return r;
    });
    updateRoomsWithHistory(newRooms);
  };

  const getResidentsForFloor = (floorNum) => {
    let count = 0;
    rooms.filter(r => r.floor === floorNum).forEach(r => {
      const cat = r.category || "";
      if (cat.includes('Studio'))    count += 1;
      else if (cat.includes('1 Bedroom')) count += 2;
      else if (cat.includes('2 Bedroom')) count += 3;
      else if (cat.includes('3 Bedroom')) count += 4;
      else if (cat.includes('4 Bedroom')) count += 4;
    });
    return count;
  };

  const metrics = useMemo(() => {
    let circPx = 0, usablePx = 0, greenPx = 0;
    rooms.forEach(room => {
      let area = room.area;
      if (!area) area = getCalculatedRoomAreaM2(room.width, room.height, room.id.split(' (')[0], COMMUNAL_GW_GH, GRID_SIZE);
      const low = (room.category || "").toLowerCase();
      const isGreen = low.includes('green') || low.includes('garden') || low.includes('playground');
      const isCirc = low.includes('circulation') || low.includes('corridor') || room.id.includes('Corridor');
      if (isGreen) greenPx += area;
      else if (isCirc) circPx += area;
      else usablePx += area;
    });
    const builtM2 = circPx + usablePx; // built (enclosed) floor area, excludes outdoor green
    return {
      circM2: Math.round(circPx), usableM2: Math.round(usablePx), greenM2: Math.round(greenPx),
      totalM2: Math.round(builtM2),
      efficiency: builtM2 === 0 ? 0 : Math.round((usablePx / builtM2) * 100)
    };
  }, [rooms]);

  const buildFloorExportData = (floorNum) => {
    const alignAngle = siteBoundary.metadata.alignment_angle || 0;
    const cx = siteBoundary.metadata.alignment_centroid?.[0] || 0;
    const cy = siteBoundary.metadata.alignment_centroid?.[1] || 0;

    return {
      floor: floorNum,
      residents: getResidentsForFloor(floorNum),
      rooms: rooms.filter(r => r.floor === floorNum).map(r => {
        const roomCx = r.x + r.width / 2;
        const roomCy = r.y + r.height / 2;
        const trueCx = Math.cos(alignAngle) * (roomCx - cx) - Math.sin(alignAngle) * (roomCy - cy) + cx;
        const trueCy = Math.sin(alignAngle) * (roomCx - cx) + Math.cos(alignAngle) * (roomCy - cy) + cy;
        
        return {
          id: r.id, category: r.category, floor: r.floor,
          local_rotation: r.rotation, 
          true_rotation: r.rotation + (alignAngle * 180 / Math.PI),
          flipX: r.flipX,
          shapeVariant: r.shapeVariant, shapePath: r.shapePath,
          optName: r.optName || null, score: r.score || null,
          area_m2: r.area, width_px: r.width, height_px: r.height,
          local_coordinates: { x: r.x, y: r.y },
          true_centroid: { x: trueCx, y: trueCy },
          floor_height_m: r.floor_height || getRoomFloorHeight(r.category),
          struct_type:    r.struct_type  || getRoomStructType(r.category),
          is_double_height: (r.floor_height || getRoomFloorHeight(r.category)) > FLOOR_TO_FLOOR_HEIGHT,
          daylight_score: r.daylight_score || null
        }
      })
    };
  };

  const triggerJSONDownload = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const handleExportFloorJSON = (floorNum) => triggerJSONDownload(buildFloorExportData(floorNum), `floor_${floorNum}_plan.json`);

  const handleExportJSON = () => {
    triggerJSONDownload({
      project: { targetUser, totalFloors: floors.length, siteBoundary },
      floors:  floors.map(f => buildFloorExportData(f))
    }, 'all_floors_layout.json');
  };

  const handleExportOBJ = () => {
    if (rooms.length === 0) return alert("No rooms to export.");

    const CATEGORY_COLORS = {
      'Residential Unit':  { r: 0.302, g: 0.639, b: 1.000 },
      'Circulation':       { r: 0.427, g: 0.702, b: 0.533 },
      'Private Communal':  { r: 0.722, g: 0.604, b: 0.427 },
      'Public Buffer Zone':{ r: 0.722, g: 0.408, b: 0.408 },
    };
    const MAT_NAMES = {
      'Residential Unit':   'mat_residential',
      'Circulation':        'mat_circulation',
      'Private Communal':   'mat_private_communal',
      'Public Buffer Zone': 'mat_public_buffer',
    };

    const alignAngle = siteBoundary.metadata.alignment_angle || 0;
    const pxCx = siteBoundary.metadata.alignment_centroid?.[0] || 0;
    const pxCy = siteBoundary.metadata.alignment_centroid?.[1] || 0;
    const pxToM = (px) => px / PIXELS_PER_METER;

    let mtl = '# LinX Massing Export — Material Library\n';
    Object.entries(CATEGORY_COLORS).forEach(([cat, c]) => {
      const name = MAT_NAMES[cat];
      mtl += `\nnewmtl ${name}\nKd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}\nKa 0.1 0.1 0.1\nKs 0.05 0.05 0.05\nd 1.0\nillum 2\n`;
    });

    let obj = '# LinX Massing Export — Meters\nmtllib massing_model.mtl\n\n';
    let vertOffset = 1;

    rooms.forEach((room, idx) => {
      const isRotated = room.rotation % 180 !== 0;
      const w_m = pxToM(isRotated ? room.height : room.width);
      const d_m = pxToM(isRotated ? room.width  : room.height);

      const fh         = room.floor_height || getRoomFloorHeight(room.category);
      const floorBase  = (room.floor - 1) * FLOOR_TO_FLOOR_HEIGHT; 
      const floorTop   = floorBase + fh;

      const pathStr = room.shapePath || '0,0 100,0 100,100 0,100';
      const localVerts2D = pathStr.trim().split(' ').map(p => {
        const [px, py] = p.split(',').map(parseFloat);
        let lx = (px / 100 - 0.5) * w_m;
        // y-down to match room placement (roomPxCy) so shapes aren't individually mirrored
        let ly = (py / 100 - 0.5) * d_m;
        if (room.flipX) lx = -lx;
        return [lx, ly];
      });

      const rad  = (room.rotation * Math.PI) / 180;
      const cosR = Math.cos(rad), sinR = Math.sin(rad);
      const rotVerts = localVerts2D.map(([lx, ly]) => [lx * cosR - ly * sinR, lx * sinR + ly * cosR]);

      const roomPxCx = room.x + room.width / 2;
      const roomPxCy = room.y + room.height / 2;

      const trueVerts = rotVerts.map(([lx, ly]) => {
          const centerDistX_m = (roomPxCx - pxCx) / PIXELS_PER_METER;
          const centerDistY_m = (roomPxCy - pxCy) / PIXELS_PER_METER;
          const localMx = centerDistX_m + lx;
          const localMy = centerDistY_m + ly;
          const trueMx = Math.cos(alignAngle) * localMx - Math.sin(alignAngle) * localMy;
          const trueMy = Math.sin(alignAngle) * localMx + Math.cos(alignAngle) * localMy;
          // proper rotation (no reflection) so the OBJ matches the 2D/3D view orientation
          return [trueMx, trueMy];
      });

      const bottomVerts = trueVerts.map(([tx, tz]) => [tx, floorBase, tz]);
      const topVerts    = trueVerts.map(([tx, tz]) => [tx, floorTop,  tz]);
      const n = trueVerts.length;

      const catKey  = Object.keys(MAT_NAMES).find(k => room.category.startsWith(k)) || 'Residential Unit';
      const safeName = room.id.replace(/[^a-zA-Z0-9_]/g, '_');

      obj += `\no room_${idx}_${safeName}\nusemtl ${MAT_NAMES[catKey]}\n`;
      [...bottomVerts, ...topVerts].forEach(([x, y, z]) => { obj += `v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}\n`; });

      const bIdx = Array.from({ length: n }, (_, i) => vertOffset + i);
      const tIdx = Array.from({ length: n }, (_, i) => vertOffset + n + i);
      obj += `f ${[...bIdx].reverse().join(' ')}\n`;
      obj += `f ${tIdx.join(' ')}\n`;
      for (let i = 0; i < n; i++) {
        obj += `f ${bIdx[i]} ${bIdx[(i + 1) % n]} ${tIdx[(i + 1) % n]} ${tIdx[i]}\n`;
      }
      vertOffset += n * 2;
    });

    const downloadBlob = (content, filename, type) => {
      const blob = new Blob([content], { type });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.appendChild(link); link.click();
      document.body.removeChild(link); URL.revokeObjectURL(url);
    };
    downloadBlob(mtl, 'massing_model.mtl', 'text/plain');
    setTimeout(() => downloadBlob(obj, 'massing_model.obj', 'text/plain'), 100);
  };

  const handleExportWireframeOBJ = () => {
    if (rooms.length === 0) return alert("No rooms to export.");
    const alignAngle = siteBoundary.metadata.alignment_angle || 0;
    const pxCx = siteBoundary.metadata.alignment_centroid?.[0] || 0;
    const pxCy = siteBoundary.metadata.alignment_centroid?.[1] || 0;
    const pxToM = (px) => px / PIXELS_PER_METER;

    let obj = '# LinX Structural Wireframe — Meters\n\n';
    let vertOffset = 1;

    rooms.forEach((room, idx) => {
      const isRotated = room.rotation % 180 !== 0;
      const w_m = pxToM(isRotated ? room.height : room.width);
      const d_m = pxToM(isRotated ? room.width  : room.height);
      const fh  = room.floor_height || getRoomFloorHeight(room.category);
      const floorBase = (room.floor - 1) * FLOOR_TO_FLOOR_HEIGHT;
      const floorTop  = floorBase + fh;

      const pathStr = room.shapePath || '0,0 100,0 100,100 0,100';
      const localVerts2D = pathStr.trim().split(' ').map(p => {
        const [px, py] = p.split(',').map(parseFloat);
        let lx = (px / 100 - 0.5) * w_m;
        // y-down to match room placement (roomPxCy) so shapes aren't individually mirrored
        let ly = (py / 100 - 0.5) * d_m;
        if (room.flipX) lx = -lx;
        return [lx, ly];
      });
      
      const rad = (room.rotation * Math.PI) / 180;
      const cosR = Math.cos(rad), sinR = Math.sin(rad);
      const rotVerts = localVerts2D.map(([lx, ly]) => [lx * cosR - ly * sinR, lx * sinR + ly * cosR]);
      
      const roomPxCx = room.x + room.width / 2;
      const roomPxCy = room.y + room.height / 2;

      const trueVerts = rotVerts.map(([lx, ly]) => {
          const centerDistX_m = (roomPxCx - pxCx) / PIXELS_PER_METER;
          const centerDistY_m = (roomPxCy - pxCy) / PIXELS_PER_METER;
          const localMx = centerDistX_m + lx;
          const localMy = centerDistY_m + ly;
          const trueMx = Math.cos(alignAngle) * localMx - Math.sin(alignAngle) * localMy;
          const trueMy = Math.sin(alignAngle) * localMx + Math.cos(alignAngle) * localMy;
          // proper rotation (no reflection) so the OBJ matches the 2D/3D view orientation
          return [trueMx, trueMy];
      });

      const bottomVerts = trueVerts.map(([tx, tz]) => [tx, floorBase, tz]);
      const topVerts    = trueVerts.map(([tx, tz]) => [tx, floorTop,  tz]);
      const n = trueVerts.length;

      obj += `\no wireframe_${idx}_${room.id.replace(/[^a-zA-Z0-9_]/g, '_')}\n`;
      [...bottomVerts, ...topVerts].forEach(([x, y, z]) => { obj += `v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}\n`; });
      const bIdx = Array.from({ length: n }, (_, i) => vertOffset + i);
      const tIdx = Array.from({ length: n }, (_, i) => vertOffset + n + i);
      for (let i = 0; i < n; i++) obj += `l ${bIdx[i]} ${bIdx[(i + 1) % n]}\n`;
      for (let i = 0; i < n; i++) obj += `l ${tIdx[i]} ${tIdx[(i + 1) % n]}\n`;
      for (let i = 0; i < n; i++) obj += `l ${bIdx[i]} ${tIdx[i]}\n`;
      vertOffset += n * 2;
    });

    const blob = new Blob([obj], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'structural_wireframe.obj';
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const sunPos = getLondonSolarPosition(solarMonth, solarHour);
  const alignAngleDeg = (siteBoundary.metadata.alignment_angle || 0) * (180 / Math.PI);

  // ============================================
  // RENDER
  // ============================================
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Jost', 'Century Gothic', 'Avenir Next', sans-serif", background: COLORS.bgDark }}>

      {/* Export context menu */}
      {exportMenu.visible && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}
          onClick={() => setExportMenu({ ...exportMenu, visible: false })}
          onContextMenu={(e) => { e.preventDefault(); setExportMenu({ ...exportMenu, visible: false }); }}
        >
          <div style={{
            position: 'absolute',
            top: Math.min(exportMenu.y, window.innerHeight - 100),
            left: Math.min(exportMenu.x, window.innerWidth - 150),
            background: COLORS.bgLight, border: `1px solid ${COLORS.borderMedium}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '4px',
            padding: '4px 0', display: 'flex', flexDirection: 'column',
            minWidth: '140px', fontFamily: "'Jost', 'Century Gothic', 'Avenir Next', sans-serif", zIndex: 10001
          }}>
            {[
              { label: 'Save image as...', action: () => { const a = document.createElement('a'); a.download = exportMenu.fileName; a.href = exportMenu.imageData; a.click(); } },
              { label: 'Copy image', action: async () => { try { const res = await fetch(exportMenu.imageData); const blob = await res.blob(); await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]); } catch { alert('Failed to copy image.'); } } }
            ].map(item => (
              <div key={item.label}
                style={{ padding: '8px 16px', fontSize: '12px', color: COLORS.textPrimary, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = COLORS.bgMedium}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={item.action}
              >{item.label}</div>
            ))}
          </div>
        </div>
      )}

      {/* TOP BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: COLORS.bgMedium, color: COLORS.textPrimary, padding: '15px 30px', borderBottom: `1px solid ${COLORS.borderMedium}`, zIndex: 999, fontSize: '14px', textTransform: 'uppercase' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={handleUndo} disabled={historyStep === 0} style={{ padding: '8px 12px', background: COLORS.bgLight, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, borderRadius: '4px', cursor: 'pointer', fontWeight: '500', opacity: historyStep === 0 ? 0.5 : 1 }}>↶</button>
            <button onClick={handleRedo} disabled={historyStep === history.length - 1} style={{ padding: '8px 12px', background: COLORS.bgLight, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, borderRadius: '4px', cursor: 'pointer', fontWeight: '500', opacity: historyStep === history.length - 1 ? 0.5 : 1 }}>↷</button>
          </div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '400', letterSpacing: '0.2px', color: COLORS.textPrimary, textTransform: 'none', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 700 }}>LinX</span> Massing Engine
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '30px', alignItems: 'center', background: COLORS.bgLight, padding: '5px 15px', borderRadius: '8px', border: `1px solid ${COLORS.borderMedium}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '12px', letterSpacing: '0.5px', color: COLORS.textSecondary, fontWeight: '500', textTransform: 'uppercase' }}>Target User:</label>
            <select value={targetUser} onChange={e => setTargetUser(e.target.value)} style={{ padding: '8px', borderRadius: '4px', background: COLORS.bgMedium, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, fontFamily: "'Jost', 'Century Gothic', 'Avenir Next', sans-serif", fontSize: '12px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              <option value="Students">Students</option>
              <option value="Young Professional">Young Professional</option>
              <option value="Family">Family</option>
              <option value="Mix">Mix</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '12px', letterSpacing: '0.5px', color: COLORS.textSecondary, fontWeight: '500', textTransform: 'uppercase' }}>Residents:</label>
            <input type="number" value={population} onChange={e => setPopulation(e.target.value)} style={{ padding: '8px', borderRadius: '4px', background: COLORS.bgMedium, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, width: '60px', fontSize: '12px', letterSpacing: '0.5px' }} />
            <button onClick={handleAutoPopulate} style={{ padding: '8px 15px', background: COLORS.bgMedium, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Auto-Populate</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '15px' }}>
          <div style={{ display: 'flex', background: COLORS.bgMedium, borderRadius: '4px', overflow: 'hidden', border: `1px solid ${COLORS.borderMedium}` }}>
            {['2D', '3D', 'GRAPH'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: '10px 20px', background: viewMode === mode ? COLORS.accent : 'transparent', color: viewMode === mode ? COLORS.bgLight : COLORS.textPrimary, border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '12px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {mode === '2D' ? '2D PLAN' : mode === '3D' ? '3D VIEW' : 'GRAPH VIEW'}
              </button>
            ))}
          </div>
          {viewMode === '2D' && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => handleStraighten(true)} disabled={isCalculating} style={{ padding: '10px 15px', background: COLORS.bgMedium, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, borderRadius: '4px', cursor: isCalculating ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '12px', letterSpacing: '0.5px', textTransform: 'uppercase', opacity: isCalculating ? 0.6 : 1 }}>
                {isCalculating ? 'Processing...' : 'Randomize'}
              </button>
              <button onClick={() => handleStraighten(false)} disabled={isCalculating} style={{ padding: '10px 25px', background: COLORS.accent, color: COLORS.bgLight, border: `1px solid ${COLORS.accent}`, borderRadius: '4px', cursor: isCalculating ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '12px', letterSpacing: '0.5px', textTransform: 'uppercase', opacity: isCalculating ? 0.6 : 1 }}>
                {isCalculating ? 'Calculating...' : 'Auto-Layout'}
              </button>
              <button onClick={handleFillGreen} title="Fill leftover ground-floor space with green areas" style={{ padding: '10px 15px', background: COLORS.bgLight, color: '#5d6a4d', border: `1px solid #7d8a6a`, borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                + Green Areas
              </button>
              <button onClick={handleUploadBoundary} style={{ padding: '10px 20px', background: COLORS.bgMedium, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Import Boundary
              </button>
              <input type="file" id="boundaryFile" accept=".json" style={{ display: "none" }} onChange={handleFileSelected} />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT PANEL */}
        <div style={{ width: '240px', flexShrink: 0, background: COLORS.bgMedium, borderRight: `1px solid ${COLORS.borderMedium}`, padding: '20px', display: 'flex', flexDirection: 'column', zIndex: 10, overflowY: 'auto' }}>
          <h3 style={{ color: COLORS.textPrimary, marginTop: 0, letterSpacing: '1px', marginBottom: '20px', fontWeight: '700', fontSize: '13px' }}>FLOORS</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
            {floors.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <button onClick={() => setActiveFloor(f)} style={{ flex: 1, padding: '10px', background: activeFloor === f ? COLORS.accent : COLORS.bgLight, color: activeFloor === f ? COLORS.bgLight : COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '12px' }}>{floorLabel(f)}</button>
                <button onClick={() => handleDeleteFloor(f)} style={{ padding: '8px 6px', background: '#b86868', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '12px' }}>×</button>
              </div>
            ))}
          </div>
          <button onClick={handleAddFloor} style={{ padding: '10px', background: 'transparent', color: COLORS.accent, border: `1px dashed ${COLORS.accent}`, borderRadius: '4px', cursor: 'pointer', fontWeight: '500', marginBottom: '20px', fontSize: '12px' }}>+ Add Floor</button>

          {/* DATA ANALYTICS */}
          <div style={{ marginTop: '25px', padding: '15px', background: COLORS.bgLight, borderRadius: '8px', border: `1px solid ${COLORS.borderMedium}` }}>
            <h4 style={{ color: COLORS.textPrimary, margin: '0 0 15px 0', fontSize: '11px', letterSpacing: '1px', fontWeight: '700' }}>DATA ANALYTICS</h4>
            {[
              { label: 'Built Area:', value: `${metrics.totalM2} m²`, color: COLORS.textSecondary },
              { label: 'Usable Space:', value: `${metrics.usableM2} m²`, color: COLORS.textPrimary },
              { label: 'Circulation:', value: `${metrics.circM2} m²`, color: '#9a9690' },
              { label: 'Green Area:', value: `${metrics.greenM2} m²`, color: '#7d8a6a' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px' }}>
                <span style={{ color: item.color }}>{item.label}</span>
                <span style={{ color: COLORS.textPrimary, fontWeight: '600' }}>{item.value}</span>
              </div>
            ))}
            <div style={{ width: '100%', background: COLORS.borderMedium, height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '5px' }}>
              <div style={{ width: `${metrics.efficiency}%`, background: metrics.efficiency >= 75 ? COLORS.accent : metrics.efficiency >= 60 ? '#9a9690' : '#b0746c', height: '100%', transition: 'width 0.3s' }} />
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px', color: COLORS.textSecondary, marginBottom: '15px' }}>
              Efficiency: <span style={{ color: metrics.efficiency >= 75 ? COLORS.accent : COLORS.textSecondary, fontWeight: '600' }}>{metrics.efficiency}%</span>
            </div>
            <button onClick={handleExportJSON} style={{ width: '100%', padding: '10px', background: COLORS.bgMedium, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '11px' }}>Export All Floors JSON</button>
          </div>

          {/* SITE BOUNDARY */}
          <div style={{ marginTop: '15px', padding: '12px', background: COLORS.bgLight, borderRadius: '8px', border: `1px solid ${COLORS.borderMedium}` }}>
            <h4 style={{ color: COLORS.accent, margin: '0 0 8px 0', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase' }}>SITE BOUNDARY</h4>
            <div style={{ fontSize: '11px', color: COLORS.textSecondary, lineHeight: '1.6' }}>
              <div style={{ marginBottom: '6px' }}><span style={{ fontWeight: '600' }}>SITE:</span> {siteBoundary.name}</div>
              {siteBoundary.metadata?.original_area_m2 && <div style={{ marginBottom: '6px' }}><span style={{ fontWeight: '600' }}>AREA:</span> {siteBoundary.metadata.original_area_m2.toFixed(0)} m²</div>}
              <div><span style={{ fontWeight: '600' }}>OFFSET:</span> {alignAngleDeg.toFixed(1)}° True North</div>
            </div>
          </div>

          {/* SHADOW & DAYLIGHT CONTROLS */}
          <div style={{ marginTop: '15px', padding: '12px', background: COLORS.bgLight, borderRadius: '8px', border: `1px solid ${COLORS.borderMedium}` }}>
            <h4 style={{ color: COLORS.accent, margin: '0 0 8px 0', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase' }}>SHADOW & DAYLIGHT (LONDON)</h4>
            <div style={{ fontSize: '11px', color: COLORS.textSecondary, lineHeight: '1.6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Month:</span><span>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][solarMonth - 1]}</span>
              </div>
              <input type="range" min="1" max="12" value={solarMonth} onChange={e => setSolarMonth(parseInt(e.target.value))} style={{ width: '100%', marginBottom: '10px', accentColor: COLORS.accent }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Time:</span><span>{solarHour.toString().padStart(2, '0')}:00</span>
              </div>
              <input type="range" min="0" max="24" value={solarHour} onChange={e => setSolarHour(parseInt(e.target.value))} style={{ width: '100%', accentColor: COLORS.accent }} />
            </div>
          </div>
        </div>

        {/* MAIN VIEW */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: COLORS.bgLight, overflow: 'hidden', position: 'relative' }}>
          {viewMode === 'GRAPH' ? (
            <div id="view-graph" onContextMenu={e => handleRightClickExport(e, 'GRAPH')} style={{ width: '100%', height: '100%', background: COLORS.bgLight, position: 'relative' }}>
              <div className="no-export" style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10, background: 'rgba(255,255,255,0.95)', padding: '15px', borderRadius: '8px', border: `1px solid ${COLORS.borderMedium}` }}>
                <h3 style={{ color: COLORS.textPrimary, margin: '0 0 5px 0', fontSize: '13px', fontWeight: '600' }}>Topology Graph</h3>
                <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: COLORS.textSecondary }}>Space Syntax node-edge mapping.</p>
                <button onClick={() => handleStraighten(false)} disabled={isCalculating} style={{ width: '100%', padding: '8px 12px', background: COLORS.accent, color: COLORS.bgLight, border: 'none', borderRadius: '4px', cursor: isCalculating ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '11px', opacity: isCalculating ? 0.6 : 1 }}>
                  {isCalculating ? 'Processing...' : '↻ Refresh Connections'}
                </button>
              </div>
              <div className="no-export" style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10, background: 'rgba(255,255,255,0.95)', padding: '15px', borderRadius: '8px', border: `1px solid ${COLORS.borderMedium}`, minWidth: '180px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: COLORS.textPrimary }}>Node Typologies</h4>
                {[['#9a9690','Core / Circulation'],['#6e2424','Residential Unit'],['#6a665f','Private Communal'],['#b0746c','Public Buffer'],['#7d8a6a','Green Area']].map(([color, label]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: '11px', color: COLORS.textSecondary }}>{label}</span>
                  </div>
                ))}
              </div>
              <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
                nodeRelSize={1}
                linkCanvasObject={(link, ctx) => {
                  const start = link.source;
                  const end   = link.target;
                  if (typeof start !== 'object' || typeof end !== 'object') return;
                  ctx.globalAlpha = (start.floor === activeFloor && end.floor === activeFloor) ? 1.0 : 0.15;
                  ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
                  ctx.strokeStyle = '#666666'; ctx.lineWidth = 1.5;
                  ctx.setLineDash(link.weight >= 10 ? [5,5] : link.weight >= 4 ? [8,4,2,4] : []);
                  ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1.0;
                }}
                nodeCanvasObject={(node, ctx, globalScale) => {
                  const fontSize = 11 / globalScale;
                  ctx.font = `bold ${fontSize}px Sans-Serif`;
                  const isActive = node.floor === activeFloor;
                  ctx.globalAlpha = isActive ? 1.0 : 0.2;
                  ctx.beginPath(); ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
                  ctx.fillStyle = node.color; ctx.fill();
                  ctx.strokeStyle = isActive ? COLORS.accentDark : '#333';
                  ctx.lineWidth = (isActive ? 3 : 0.5) / globalScale; ctx.stroke();
                  const isLight = ['#b3b3b3', '#dfa39c', '#e0e0e0'].includes(node.color);
                  ctx.fillStyle = isLight ? '#333333' : '#ffffff';
                  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                  const words = node.name.split('_');
                  if (words.length > 1) {
                    ctx.fillText(words[0],                   node.x, node.y - fontSize / 1.8);
                    ctx.fillText(words.slice(1).join('_'),  node.x, node.y + fontSize / 1.8);
                  } else {
                    ctx.fillText(node.name, node.x, node.y);
                  }
                  ctx.globalAlpha = 1.0;
                }}
              />
            </div>

          ) : viewMode === '3D' ? (
            <div id="view-3d" onContextMenu={e => handleRightClickExport(e, '3D')} style={{ width: '100%', height: '100%', background: COLORS.bgLight }}>
              <div className="no-export" style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10 }}>
                <div style={{ background: 'rgba(255,255,255,0.8)', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: `1px solid ${COLORS.borderMedium}` }}>
                  <h3 style={{ color: COLORS.textPrimary, margin: '0 0 5px 0', fontSize: '13px', fontWeight: '600' }}>3D Massing Model</h3>
                  <p style={{ margin: 0, fontSize: '11px', color: COLORS.textSecondary }}>Left Click = Orbit | Right Click = Pan | Scroll = Zoom</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleExportOBJ} style={{ padding: '8px 15px', background: COLORS.accent, color: COLORS.bgLight, border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>Export Massing .OBJ</button>
                  <button onClick={handleExportWireframeOBJ} style={{ padding: '8px 15px', background: COLORS.textPrimary, color: COLORS.bgLight, border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>Export Wireframe .OBJ</button>
                </div>
              </div>
              <Canvas shadows camera={CAMERA_SETTINGS} gl={{ preserveDrawingBuffer: true }}>
                <SceneCapturer sceneRef={sceneRef} />
                <ambientLight intensity={sunPos.isDaylight ? 0.3 : 0.1} />
                {sunPos.isDaylight && (
                  <directionalLight 
                    position={[sunPos.x, sunPos.y, sunPos.z]} 
                    intensity={1.5} 
                    castShadow 
                    shadow-mapSize-width={2048}
                    shadow-mapSize-height={2048}
                    shadow-camera-left={-200}
                    shadow-camera-right={200}
                    shadow-camera-top={200}
                    shadow-camera-bottom={-200}
                    shadow-bias={-0.0005}
                  />
                )}
                <OrbitControls />
                <gridHelper args={[200, 200, '#cccccc', '#e0e0e0']} position={[0, -0.1, 0]} />
                
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]} receiveShadow>
                  <planeGeometry args={[500, 500]} />
                  <shadowMaterial opacity={0.3} />
                </mesh>

                <Boundary3D boundary={siteBoundary} scale={GRID_SIZE} />
                <group>
                  {rooms.map(room => (
                    <ModularMesh 
                      key={`3d-${room.id}`} 
                      room={room} 
                      scale={GRID_SIZE} 
                      boundary={siteBoundary} 
                    />
                  ))}
                </group>
              </Canvas>
            </div>

          ) : (
            <div style={{ display: 'flex', flex: 1, padding: '20px', background: COLORS.bgLight, overflowX: 'auto', gap: '20px' }}>
              {floors.map(floor => (
                <div id={`view-2d-${floor}`} key={floor} onContextMenu={e => handleRightClickExport(e, '2D', floor)}
                  style={{ flex: '1 0 auto', minWidth: '820px', display: 'flex', flexDirection: 'column', background: COLORS.bgDark, borderRadius: '8px', border: `1px solid ${COLORS.borderMedium}`, position: 'relative', overflow: 'hidden' }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUpOrLeave}
                  onMouseLeave={handleCanvasMouseUpOrLeave}
                  onWheel={handleWheel}
                >
                  <div style={{ flex: 1, position: 'relative', background: COLORS.bgLight, overflow: 'hidden' }} id="canvas-container">
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`, transformOrigin: '0 0', cursor: isDraggingCanvas ? 'grabbing' : 'grab', zIndex: 1 }}>

                      {/* TRUE 1x1m Visual Grid matched to internally snapping at 20px */}
                      <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }} id="canvas-svg">
                        <defs>
                          <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                            <path d="M 20 0 L 0 0 0 20" fill="none" stroke={COLORS.borderMedium} strokeWidth="0.5" />
                          </pattern>
                          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                            <rect width="100" height="100" fill="url(#smallGrid)" />
                            <path d="M 100 0 L 0 0 0 100" fill="none" stroke={COLORS.borderDark} strokeWidth="1" />
                          </pattern>
                        </defs>
                        <rect id="canvas-background" x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid)" opacity="0.4" />

                        {siteBoundary.metadata?.polygon_pixels?.length > 0 ? (
                          <>
                            <polygon points={siteBoundary.metadata.polygon_pixels.map(p => `${p[0]},${p[1]}`).join(' ')} fill={`${COLORS.accent}15`} stroke="none" />
                            <polygon points={siteBoundary.metadata.polygon_pixels.map(p => `${p[0]},${p[1]}`).join(' ')} fill="none" stroke={COLORS.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </>
                        ) : (
                          <rect x={siteBoundary.minX} y={siteBoundary.minY} width={siteBoundary.maxX - siteBoundary.minX} height={siteBoundary.maxY - siteBoundary.minY} fill={`${COLORS.accent}15`} stroke={COLORS.accent} strokeWidth="2.5" strokeDasharray="5,5" />
                        )}

                        {rules.filter(r => r.floor === floor).map(rule => {
                          const roomA = rooms.find(r => r.id === rule.source);
                          const roomB = rooms.find(r => r.id === rule.target);
                          if (!roomA || !roomB) return null;
                          const dashArray = rule.weight >= 10 ? "5,5" : rule.weight >= 4 ? "8,4" : "none";
                          return (
                            <line key={rule.rule_id}
                              x1={roomA.x + roomA.width / 2} y1={roomA.y + roomA.height / 2}
                              x2={roomB.x + roomB.width / 2} y2={roomB.y + roomB.height / 2}
                              stroke={rule.weight >= 2.0 ? '#6db388' : '#b86868'}
                              strokeWidth="2" strokeDasharray={dashArray}
                              vectorEffect="non-scaling-stroke"
                            />
                          );
                        })}
                      </svg>

                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                        
                        {/* Dynamic Void Rendering */}
                        {rooms.filter(r => r.floor < floor && ((r.floor - 1) * FLOOR_TO_FLOOR_HEIGHT + (r.floor_height || getRoomFloorHeight(r.category))) > ((floor - 1) * FLOOR_TO_FLOOR_HEIGHT)).map(room => {
                          const displayName = room.category.split(' - ')[1];
                          return (
                            <div key={`void-${room.id}`} style={{
                                position: 'absolute', left: room.x, top: room.y, width: room.width, height: room.height,
                                background: 'repeating-linear-gradient(45deg, rgba(200,200,200,0.1), rgba(200,200,200,0.1) 10px, rgba(200,200,200,0.2) 10px, rgba(200,200,200,0.2) 20px)',
                                border: `2px dashed ${COLORS.borderDark}`,
                                zIndex: 1, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transform: `scaleX(${room.flipX ? -1 : 1}) rotate(${room.rotation}deg)`,
                                transformOrigin: '50% 50%'
                            }}>
                                <span style={{ fontSize: '12px', color: COLORS.textSecondary, fontWeight: '700', textShadow: '1px 1px 0 #fff' }}>
                                    {displayName} (Void)
                                </span>
                            </div>
                          );
                        })}

                        {rooms.filter(r => r.floor === floor).map(room => {
                          const displayName = room.category.split(' - ')[1];
                          const displayArea = room.area || getCalculatedRoomAreaM2(room.width, room.height, displayName, COMMUNAL_GW_GH, GRID_SIZE);
                          
                          const hasScore = room.daylight_score !== undefined && room.daylight_score !== null;
                          const scoreColor = !hasScore ? '' : room.daylight_score >= 0.4 ? '#6db388' : room.daylight_score >= 0.2 ? '#c2a37a' : '#b86868';
                          const isWarning = hasScore && room.daylight_score < 0.2;

                          return (
                            <Rnd
                              key={room.id}
                              position={{ x: room.x, y: room.y }}
                              size={{ width: room.width, height: room.height }}
                              onDragStart={() => setSelectedRoomId(room.id)}
                              onDrag={(e, d) => handleDrag(room, d.x, d.y)}
                              onDragStop={(e, d) => handleDragStop(room, e, d)}
                              enableResizing={!room.pinned}
                              disableDragging={room.pinned}
                              scale={canvasZoom}
                              onResizeStop={(e, direction, ref, delta, position) => {
                                if (room.pinned) return;
                                const snapW = Math.max(SUBGRID_SIZE, Math.round(ref.offsetWidth  / SUBGRID_SIZE) * SUBGRID_SIZE);
                                const snapH = Math.max(SUBGRID_SIZE, Math.round(ref.offsetHeight / SUBGRID_SIZE) * SUBGRID_SIZE);
                                const snapX = Math.round(position.x / SUBGRID_SIZE) * SUBGRID_SIZE;
                                const snapY = Math.round(position.y / SUBGRID_SIZE) * SUBGRID_SIZE;
                                updateRoomsWithHistory(rooms.map(r => r.id === room.id ? { ...r, width: snapW, height: snapH, x: snapX, y: snapY } : r));
                              }}
                              resizeHandleStyles={{ right: { cursor: 'ew-resize' }, left: { cursor: 'ew-resize' }, top: { cursor: 'ns-resize' }, bottom: { cursor: 'ns-resize' } }}
                              style={{ position: 'absolute', zIndex: selectedRoomId === room.id ? 10 : 5, pointerEvents: 'auto' }}
                            >
                              <div onMouseDown={() => setSelectedRoomId(room.id)} style={{ width: '100%', height: '100%', position: 'relative' }}>
                                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, cursor: room.pinned ? 'not-allowed' : 'move', overflow: 'visible' }}>
                                  <polygon
                                    points={room.shapePath || '0,0 100,0 100,100 0,100'}
                                    fill={room.bgColor}
                                    stroke={isWarning ? '#b86868' : selectedRoomId === room.id ? COLORS.accentDark : room.borderColor}
                                    strokeWidth={selectedRoomId === room.id ? "5" : isWarning ? "4" : "3"}
                                    style={{ transformOrigin: '50% 50%', transform: `scaleX(${room.flipX ? -1 : 1}) rotate(${room.rotation}deg)` }}
                                  />
                                  <WallPlan2D room={room} />
                                </svg>

                                <div
                                  onClick={() => togglePin(room.id)}
                                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); handleModifyShape(room.id, 'ROTATE'); }}
                                  onDoubleClick={() => togglePin(room.id)}
                                  onAuxClick={e => { if (e.button === 1) handleModifyShape(room.id, 'CYCLE_VARIANT'); }}
                                  style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', pointerEvents: 'auto', cursor: room.pinned ? 'not-allowed' : 'move' }}
                                >
                                  {/* Pin indicator */}
                                  <svg width="30" height="30" style={{ position: 'absolute', top: '5px', right: '5px', cursor: 'pointer', zIndex: 10 }} onClick={() => togglePin(room.id)}>
                                    {room.pinned
                                      ? <circle cx="15" cy="15" r="6" fill={room.borderColor} />
                                      : <circle cx="15" cy="15" r="6" fill="none" stroke={room.borderColor} strokeWidth="2" />
                                    }
                                  </svg>

                                  {/* Room label */}
                                  <div style={roomLabelContainerStyle}>
                                    <span style={{ fontSize: '11px', fontWeight: '400', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>{displayName}</span>
                                    <span style={{ fontSize: '11px', opacity: 0.9, textShadow: '1px 1px 2px rgba(0,0,0,0.8)', marginTop: '2px' }}>{displayArea}m²</span>
                                    
                                    {/* Daylight Badge */}
                                    {hasScore && (
                                      <span style={{ fontSize: '11px', color: '#fff', background: scoreColor, padding: '2px 4px', borderRadius: '3px', marginTop: '4px', fontWeight: '700' }}>
                                        Daylight: {Math.round(room.daylight_score * 100)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Rnd>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="no-export" style={{ position: 'absolute', bottom: '30px', left: '30px', zIndex: 20, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <svg width="40" height="60" viewBox="0 0 40 60" fill="none" style={{ transform: `rotate(${alignAngleDeg}deg)` }}>
                      <path d="M20 0 L40 40 L20 30 L0 40 Z" fill="#b86868" />
                      <text x="20" y="55" fill="#333333" fontSize="13px" fontWeight="bold" textAnchor="middle" fontFamily="'Jost', sans-serif">N</text>
                    </svg>
                  </div>

                  {/* Floor controls */}
                  <div className="no-export" style={{ position: 'absolute', top: '20px', left: '20px', color: COLORS.textSecondary, fontWeight: '600', fontSize: '16px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <span style={{ fontSize: '13px' }}>{floorLabel(floor).toUpperCase()} {activeFloor === floor && <span style={{ color: COLORS.accent, fontSize: '12px' }}>(Active)</span>}</span>
                      <span style={{ fontSize: '11px', background: COLORS.bgMedium, color: COLORS.textSecondary, padding: '4px 8px', borderRadius: '4px', border: `1px solid ${COLORS.borderMedium}` }}>Residents: {getResidentsForFloor(floor)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[
                        { label: 'Lock All',   action: () => handlePinFloor(floor, true),  bg: COLORS.accentDark, color: COLORS.bgLight, border: 'none' },
                        { label: 'Unlock All', action: () => handlePinFloor(floor, false), bg: COLORS.bgMedium,   color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}` },
                        { label: 'Clear Floor',action: () => handleResetFloor(floor),      bg: '#b86868',         color: 'white', border: 'none' },
                        { label: 'Export JSON',action: () => handleExportFloorJSON(floor), bg: COLORS.accent,     color: COLORS.bgLight, border: 'none' },
                      ].map(btn => (
                        <button key={btn.label} onClick={btn.action} style={{ padding: '4px 10px', background: btn.bg, color: btn.color, border: btn.border, borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600', pointerEvents: 'auto' }}>{btn.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Help overlay */}
                  <div className="no-export" style={{ position: 'absolute', top: '20px', right: '20px', color: COLORS.textPrimary, fontSize: '11px', fontWeight: '600', zIndex: 10, background: 'rgba(255,255,255,0.8)', padding: '8px 12px', borderRadius: '4px', textAlign: 'right', lineHeight: '1.5', pointerEvents: 'none', border: `1px solid ${COLORS.borderMedium}` }}>
                    <span style={{ color: COLORS.accent }}>Double-Click:</span> Lock/Pin<br/>
                    <span style={{ color: COLORS.accent }}>Select + Delete:</span> Delete Room<br/>
                    <span style={{ color: COLORS.accent }}>Right-Click (Room):</span> Rotate<br/>
                    <span style={{ color: COLORS.accent }}>Right-Click (Canvas):</span> Export PNG<br/>
                    <span style={{ color: COLORS.accent }}>Middle-Click:</span> Cycle Variant
                  </div>

                  {/* Zoom controls */}
                  <div className="no-export" style={{ position: 'absolute', bottom: '20px', right: '20px', zIndex: 20, display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.8)', padding: '10px', borderRadius: '8px', border: `1px solid ${COLORS.borderMedium}` }}>
                    <button onClick={() => handleZoomStep(false)} style={{ padding: '8px 10px', background: COLORS.bgMedium, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>Zoom Out</button>
                    <span style={{ padding: '8px 10px', color: COLORS.textSecondary, fontSize: '11px', display: 'flex', alignItems: 'center', fontWeight: '600', minWidth: '45px', justifyContent: 'center' }}>{(canvasZoom * 100).toFixed(0)}%</span>
                    <button onClick={() => handleZoomStep(true)} style={{ padding: '8px 10px', background: COLORS.bgMedium, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>Zoom In</button>
                    <button onClick={() => { const { zoom, pan } = calculateOptimalZoom(siteBoundary); setCanvasZoom(zoom); setCanvasPan(pan); }} style={{ padding: '8px 12px', background: COLORS.accent, color: COLORS.bgLight, border: `1px solid ${COLORS.accent}`, borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '11px', whiteSpace: 'nowrap' }}>Fit Boundary</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT PANEL — Component Library */}
        <div style={{ width: '280px', flexShrink: 0, background: COLORS.bgMedium, borderLeft: `1px solid ${COLORS.borderMedium}`, padding: '20px', overflowY: 'auto', zIndex: 10 }}>
          <h3 style={{ color: COLORS.textPrimary, marginTop: 0, letterSpacing: '1px', marginBottom: '20px', fontWeight: '700', fontSize: '13px' }}>Component Library</h3>

          {Object.entries(communalComponents).map(([groupName, items]) => (
            <div key={groupName} style={{ marginBottom: '25px' }}>
              <div style={{ color: COLORS.textSecondary, fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', borderBottom: `1px solid ${COLORS.borderMedium}`, paddingBottom: '5px' }}>{groupName}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {items.map(itemName => (
                  <button key={itemName} onClick={() => handleAddRoom(groupName, itemName)}
                    style={{ padding: '8px', background: COLORS.bgLight, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, borderLeft: `5px solid ${COLORS.borderMedium}`, borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: '500', fontSize: '11px' }}>
                    + {itemName}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div style={{ marginBottom: '25px' }}>
            <div style={{ color: COLORS.textSecondary, fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', borderBottom: `1px solid ${COLORS.borderMedium}`, paddingBottom: '5px' }}>Residential Unit Catalog</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {residentialComponents.map(itemName => {
                const isActive = activeCatalogContext === itemName;
                return (
                  <button key={itemName} onClick={(e) => { setCatalogAnchorTop(e.currentTarget.getBoundingClientRect().top); setActiveCatalogContext(isActive ? null : itemName); }}
                    style={{ padding: '8px', background: isActive ? COLORS.borderMedium : COLORS.bgLight, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderMedium}`, borderLeft: `5px solid ${COLORS.borderMedium}`, borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: '500', fontSize: '11px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Browse {itemName}</span>
                    <span style={{ color: isActive ? COLORS.accent : COLORS.textSecondary, transform: isActive ? 'rotate(180deg)' : 'none' }}>&lt;</span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeCatalogContext && (
            <div style={{ position: 'fixed', top: Math.max(8, Math.min(catalogAnchorTop, window.innerHeight - (90 + CATALOG_DATA[activeCatalogContext].length * 74))), right: 296, width: 250, background: COLORS.bgLight, border: `1px solid ${COLORS.borderMedium}`, borderRadius: '6px', boxShadow: '0 6px 20px rgba(0,0,0,0.18)', padding: '14px', zIndex: 50, maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ color: COLORS.accent, fontSize: '11px', fontWeight: '600' }}>{activeCatalogContext} Options</div>
                <span onClick={() => setActiveCatalogContext(null)} style={{ cursor: 'pointer', color: COLORS.textSecondary, fontWeight: '700', fontSize: '16px', lineHeight: '1' }}>×</span>
              </div>
              {CATALOG_DATA[activeCatalogContext].map((opt, i) => (
                <div key={i} onClick={() => handleAddCatalogRoom("Residential Unit", activeCatalogContext, opt)}
                  style={{ background: 'rgba(255,255,255,0.5)', borderBottom: `1px solid ${COLORS.borderMedium}`, padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '5px' }}>
                  <div style={{ width: '35px', height: '35px', background: 'rgba(77,163,255,0.1)', borderRadius: '4px' }}>
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                      <polygon points={opt.path} fill="rgba(77,163,255,0.5)" stroke={COLORS.accent} strokeWidth="4" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: COLORS.textPrimary, fontSize: '11px', fontWeight: '600' }}>{opt.opt}</div>
                    <div style={{ color: COLORS.textSecondary, fontSize: '11px', marginTop: '2px' }}>Area: {opt.area} m²</div>
                    <div style={{ color: COLORS.accent, fontSize: '11px', fontWeight: '600', marginTop: '2px' }}>Score: {opt.score}</div>
                  </div>
                  <div style={{ color: COLORS.accent, fontWeight: '600', fontSize: '16px' }}>+</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;