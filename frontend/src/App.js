import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter';

// --- STRICT ARCHITECTURAL GRID LOGIC ---
const GRID_SIZE = 20;       // 20px = 1m structural boundary
const SUBGRID_SIZE = 10;    // 10px = 50cm snapping constraint
const CAMERA_SETTINGS = { position: [0, 40, 60], fov: 45 };

// --- RESIDENTIAL CATALOG (Translated from PDF visuals to exact SVG polygons) ---
const CATALOG_DATA = {
  "Studio": [
    { opt: "Option 10/10", area: 39, score: 0.97, path: "0,0 100,0 100,100 0,100", variant: 0, gw: 6.5, gh: 6 },
    { opt: "Option 9/10", area: 39, score: 0.97, path: "20,30 20,0 100,0 100,100 0,100 0,30", variant: 1, gw: 7.5, gh: 6 },
    { opt: "Option 7/10", area: 39, score: 0.82, path: "30,40 30,0 100,0 100,100 0,100 0,40", variant: 2, gw: 7.5, gh: 6 },
    { opt: "Option 2/10", area: 39, score: 0.40, path: "0,0 100,0 100,70 80,70 80,100 0,100", variant: 3, gw: 7.5, gh: 6 } 
  ],
  "1 Bedroom": [
    { opt: "Option 10/10", area: 51, score: 0.94, path: "0,0 50,0 50,20 75,20 75,40 100,40 100,100 0,100", variant: 0, gw: 8.5, gh: 6 },
    { opt: "Option 8/10", area: 51, score: 0.94, path: "0,0 60,0 60,40 100,40 100,100 0,100", variant: 1, gw: 9, gh: 6 },
    { opt: "Option 7/10", area: 51, score: 0.81, path: "40,40 40,0 100,0 100,100 0,100 0,40", variant: 2, gw: 9, gh: 6 },
    { opt: "Option 6/10", area: 51, score: 0.93, path: "0,100 0,60 25,60 25,30 50,30 50,0 100,0 100,100", variant: 3, gw: 9, gh: 6 } 
  ],
  "2 Bedroom": [
    { opt: "Option 5/10", area: 60, score: 1.00, path: "0,0 100,0 100,100 0,100", variant: 0, gw: 10, gh: 6 },
    { opt: "Option 10/10", area: 60, score: 0.95, path: "0,0 70,0 70,40 100,40 100,100 0,100", variant: 1, gw: 10, gh: 6 },
    { opt: "Option 7/10", area: 60, score: 0.86, path: "30,40 30,0 100,0 100,100 0,100 0,40", variant: 2, gw: 10, gh: 6 },
    { opt: "Option 2/10", area: 60, score: 0.86, path: "0,0 100,0 100,60 70,60 70,100 0,100", variant: 3, gw: 10, gh: 6 }
  ],
  "3 Bedroom": [
    { opt: "Option 9/10", area: 75, score: 0.96, path: "30,30 30,0 100,0 100,100 0,100 0,30", variant: 1, gw: 10, gh: 7.5 },
    { opt: "Option 4/10", area: 75, score: 0.94, path: "0,0 70,0 70,40 100,40 100,100 0,100", variant: 2, gw: 10, gh: 7.5 },
    { opt: "Option 3/10", area: 75, score: 0.89, path: "0,0 100,0 100,100 0,100", variant: 0, gw: 10, gh: 7.5 },
    { opt: "Option 2/10", area: 75, score: 0.82, path: "40,30 40,0 100,0 100,100 0,100 0,30", variant: 3, gw: 10, gh: 7.5 }
  ],
  "4 Bedroom": [
    { opt: "Option 9/10", area: 90, score: 1.00, path: "0,0 100,0 100,100 0,100", variant: 0, gw: 10, gh: 9 },
    { opt: "Option 8/10", area: 90, score: 0.92, path: "0,0 60,0 60,40 100,40 100,100 0,100", variant: 1, gw: 10, gh: 9 },
    { opt: "Option 7/10", area: 90, score: 0.94, path: "40,40 40,0 100,0 100,100 0,100 0,40", variant: 2, gw: 10, gh: 9 },
    { opt: "Option 6/10", area: 90, score: 0.80, path: "30,50 30,0 100,0 100,100 0,100 0,50", variant: 3, gw: 10, gh: 9 }
  ]
};

// --- COMMUNAL LOGIC (1 Voxel = 3x3 meters. Dimensions mapped below) ---
const COMMUNAL_GW_GH = {
    // Circulation
    "Core": { gw: 6, gh: 6, path: "0,0 100,0 100,100 0,100" }, 
    "Stairs": { gw: 3, gh: 6, path: "0,0 100,0 100,100 0,100" }, 
    "Corridor": { gw: 3, gh: 15, path: "0,0 100,0 100,100 0,100" },
    
    // Private Communal
    "Shared Kitchen": { gw: 12, gh: 3, path: "0,0 100,0 100,100 0,100" },
    "Shared Living Room": { gw: 9, gh: 6, path: "0,0 100,0 100,100 0,100" },
    "Game Room": { gw: 6, gh: 3, path: "0,0 100,0 100,100 0,100" },
    "Library": { gw: 6, gh: 6, path: "0,50 50,50 50,0 100,0 100,100 0,100", areaFactor: 0.75 }, 
    "Workspace Room": { gw: 6, gh: 6, path: "0,0 50,0 50,50 100,50 100,100 0,100", areaFactor: 0.75 }, 
    "Meeting Room": { gw: 3, gh: 3, path: "0,0 100,0 100,100 0,100" }, 
    "Concentration Pod": { gw: 3, gh: 1.5, path: "0,0 100,0 100,100 0,100" },
    
    // Public Buffer Zone
    "Multipurpose Hall": { gw: 12, gh: 6, path: "0,0 100,0 100,100 0,100" }, 
    "Mini Cinema": { gw: 9, gh: 6, path: "0,0 100,0 100,100 0,100" }, 
    "Gym": { gw: 12, gh: 3, path: "0,0 100,0 100,100 0,100" }, 
    "Events Room": { gw: 9, gh: 3, path: "0,0 100,0 100,100 0,100" }, 
    "Indoor Play Area": { gw: 6, gh: 6, path: "0,0 100,0 100,100 0,100" }, 
    "Garden": { gw: 15, gh: 3, path: "0,0 100,0 100,100 0,100" }, 
    "Outdoor Playground": { gw: 15, gh: 3, path: "0,0 100,0 100,100 0,100" }
};

const communalComponents = {
  "Circulation": ["Core", "Stairs", "Corridor"], 
  "Private Communal": ["Shared Living Room", "Shared Kitchen", "Game Room", "Library", "Workspace Room", "Meeting Room", "Concentration Pod"],
  "Public Buffer Zone": ["Garden", "Outdoor Playground", "Multipurpose Hall", "Mini Cinema", "Gym", "Events Room", "Indoor Play Area"]
};
const residentialComponents = ["Studio", "1 Bedroom", "2 Bedroom", "3 Bedroom", "4 Bedroom"];

const SceneCapturer = ({ sceneRef }) => {
  const { scene } = useThree();
  useEffect(() => { sceneRef.current = scene; }, [scene, sceneRef]);
  return null;
};

// 3D Mesh Component (Read-only view, accurately projecting 2D bounds)
const ModularMesh = ({ room, scale, floorHeight }) => {
  const isRotated = room.rotation === 90 || room.rotation === 270;
  const originalWidth = isRotated ? room.height : room.width;
  const originalHeight = isRotated ? room.width : room.height;

  const w = originalWidth / scale;
  const d = originalHeight / scale; 
  const h = floorHeight;
  const x = (room.x + room.width / 2 - 400) / scale;
  const z = (room.y + room.height / 2 - 300) / scale;
  const y = (room.floor - 1) * floorHeight;

  const geometry = useMemo(() => {
    const path = room.shapePath || "0,0 100,0 100,100 0,100";
    const pts = path.split(' ').map(p => {
      const [px, py] = p.split(',');
      let localX = (parseFloat(px)/100 - 0.5) * w;
      let localY = (parseFloat(py)/100 - 0.5) * d;
      if (room.flipX) localX = -localX; 
      return new THREE.Vector2(localX, localY);
    });
    const shape = new THREE.Shape(pts);
    return new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  }, [room.shapePath, w, d, h, room.flipX]);

  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, (room.rotation * Math.PI) / 180]} name={room.category}>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={room.borderColor} transparent opacity={0.85} roughness={0.3} />
      <Edges scale={1} threshold={15} color="white" />
    </mesh>
  );
};

// Standalone Helper Function for Area Calculation to enable reuse and a fallback value
const getCalculatedRoomAreaM2 = (roomWidth, roomHeight, roomName, communalGwGh, gridSize) => {
    const metrics = communalGwGh[roomName] || { areaFactor: 1 };
    const factor = metrics.areaFactor || 1;
    const calculatedArea = Math.round((roomWidth / gridSize) * (roomHeight / gridSize) * factor);
    return calculatedArea;
};

// Style object for centered, padded room labels with multi-line wrap
const roomLabelContainerStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  pointerEvents: 'none',
  zIndex: 1,
  textAlign: 'center',
  padding: '5px',
  boxSizing: 'border-box',
  wordBreak: 'break-word'
};

function App() {
  
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  const [rooms, setRooms] = useState([]);
  const [rules, setRules] = useState([]);
  const [floors, setFloors] = useState([1]); 
  const [activeFloor, setActiveFloor] = useState(1); 
  const [activeCatalogContext, setActiveCatalogContext] = useState(null);

  const [history, setHistory] = useState([[]]); 
  const [historyStep, setHistoryStep] = useState(0);

  const [targetUser, setTargetUser] = useState('Young Professional');
  const [roomArea, setRoomArea] = useState(25); 
  const [population, setPopulation] = useState(15); 
  const [isCalculating, setIsCalculating] = useState(false);
  const [viewMode, setViewMode] = useState('2D'); 

  const sceneRef = useRef();
  const TRASH_SIZE = 120; 

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
      setRules([]); 
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      setHistoryStep(historyStep + 1);
      setRooms(history[historyStep + 1]);
      setRules([]);
    }
  };

  const handleAddFloor = () => {
    const nextFloor = floors.length > 0 ? Math.max(...floors) + 1 : 1;
    setFloors([...floors, nextFloor]);
    setActiveFloor(nextFloor);

    const circRooms = rooms.filter(r => r.floor === floors[0] && r.category.includes('Circulation') && !r.category.includes('Corridor'));
    const clonedCircRooms = circRooms.map(r => ({
      ...r, id: `${r.id.split(' ')[0]} (${Math.floor(Math.random() * 10000)})`, floor: nextFloor
    }));
    updateRoomsWithHistory([...rooms, ...clonedCircRooms]);
  };

  const handleDeleteFloor = (floorToDelete) => {
    if (floors.length === 1) return alert("You must have at least one floor.");
    setFloors(floors.filter(f => f !== floorToDelete));
    updateRoomsWithHistory(rooms.filter(room => room.floor !== floorToDelete));
    if (activeFloor === floorToDelete) setActiveFloor(floors[0]);
  };

  const handleResetFloor = (floorNum) => {
    updateRoomsWithHistory(rooms.filter(r => r.floor !== floorNum));
  };

  const getColors = (categoryName) => {
    if (categoryName.includes('Corridor')) return { bg: 'rgba(158, 158, 158, 0.4)', border: '#9e9e9e' };
    if (categoryName === 'Circulation') return { bg: 'rgba(156, 39, 176, 0.2)', border: '#9c27b0' }; 
    if (categoryName === 'Private Communal') return { bg: 'rgba(76, 175, 80, 0.2)', border: '#4caf50' }; 
    if (categoryName === 'Public Buffer Zone') return { bg: 'rgba(255, 152, 0, 0.2)', border: '#ff9800' }; 
    return { bg: 'rgba(77, 163, 255, 0.2)', border: '#4da3ff' }; 
  };

  const createRoomObject = (categoryName, itemName, customData = null) => {
    let { bg, border } = getColors(categoryName);
    
    let startWidth = 5 * GRID_SIZE; let startHeight = 5 * GRID_SIZE;
    let shapePath = "0,0 100,0 100,100 0,100"; let variant = 0; let optName = null;
    let calculatedArea = 0;

    if (customData) {
        shapePath = customData.path; variant = customData.variant; optName = customData.opt;
        startWidth = customData.gw * GRID_SIZE;
        startHeight = customData.gh * GRID_SIZE;
        calculatedArea = customData.area; 
    } else {
        const metrics = COMMUNAL_GW_GH[itemName] || { gw: Math.sqrt(roomArea), gh: Math.sqrt(roomArea), path: "0,0 100,0 100,100 0,100", areaFactor: 1 };
        startWidth = metrics.gw * GRID_SIZE;
        startHeight = metrics.gh * GRID_SIZE;
        shapePath = metrics.path;
        calculatedArea = getCalculatedRoomAreaM2(startWidth, startHeight, itemName, COMMUNAL_GW_GH, GRID_SIZE);
    }

    startWidth = Math.round(startWidth / SUBGRID_SIZE) * SUBGRID_SIZE;
    startHeight = Math.round(startHeight / SUBGRID_SIZE) * SUBGRID_SIZE;

    return {
      id: `${itemName} (${Math.floor(Math.random() * 10000)})`,
      category: `${categoryName} - ${itemName}`, floor: activeFloor,
      x: 350 + (Math.round(Math.random() * 100 / SUBGRID_SIZE) * SUBGRID_SIZE), 
      y: 250 + (Math.round(Math.random() * 100 / SUBGRID_SIZE) * SUBGRID_SIZE),
      width: startWidth, height: startHeight, bgColor: bg, borderColor: border,
      shapePath, shapeVariant: variant, optName, score: customData ? customData.score : null, area: calculatedArea,
      rotation: 0, flipX: false, pinned: false
    };
  };

  const handleAddRoom = (categoryName, itemName) => {
    if (categoryName === 'Circulation' && itemName !== 'Corridor') {
      const circulationRooms = floors.map(f => ({ ...createRoomObject(categoryName, itemName), floor: f }));
      updateRoomsWithHistory([...rooms, ...circulationRooms]);
    } else {
      updateRoomsWithHistory([...rooms, createRoomObject(categoryName, itemName)]);
    }
  };

  const handleAddCatalogRoom = (categoryName, itemName, catalogItem) => {
    updateRoomsWithHistory([...rooms, createRoomObject(categoryName, itemName, catalogItem)]);
    setActiveCatalogContext(null); 
  };

  const handleAutoPopulate = () => {
    const newRooms = [];
    let remainingPop = parseInt(population, 10);
    if (isNaN(remainingPop) || remainingPop <= 0) return;

    const getRandomVariant = (itemName) => CATALOG_DATA[itemName][Math.floor(Math.random() * CATALOG_DATA[itemName].length)];

    if (targetUser === 'Students') {
      const studioPop = Math.floor(remainingPop * 0.4); const fourBedPop = remainingPop - studioPop;
      for(let i=0; i<Math.ceil(studioPop/1); i++) newRooms.push(createRoomObject("Residential Unit", "Studio", getRandomVariant("Studio")));
      for(let i=0; i<Math.ceil(fourBedPop/4); i++) newRooms.push(createRoomObject("Residential Unit", "4 Bedroom", getRandomVariant("4 Bedroom")));
    } else if (targetUser === 'Young Professional') {
      const sPop = Math.floor(remainingPop * 0.3); const oPop = Math.floor(remainingPop * 0.4); const tPop = remainingPop - sPop - oPop;
      for(let i=0; i<Math.ceil(sPop/1); i++) newRooms.push(createRoomObject("Residential Unit", "Studio", getRandomVariant("Studio")));
      for(let i=0; i<Math.ceil(oPop/2); i++) newRooms.push(createRoomObject("Residential Unit", "1 Bedroom", getRandomVariant("1 Bedroom")));
      for(let i=0; i<Math.ceil(tPop/3); i++) newRooms.push(createRoomObject("Residential Unit", "2 Bedroom", getRandomVariant("2 Bedroom")));
    } else if (targetUser === 'Family') {
      const tPop = Math.floor(remainingPop * 0.4); const thPop = remainingPop - tPop;
      for(let i=0; i<Math.ceil(tPop/3); i++) newRooms.push(createRoomObject("Residential Unit", "2 Bedroom", getRandomVariant("2 Bedroom")));
      for(let i=0; i<Math.ceil(thPop/4); i++) newRooms.push(createRoomObject("Residential Unit", "3 Bedroom", getRandomVariant("3 Bedroom")));
    }

    // Check if Core exists before adding
    const existingCore = rooms.some(r => r.floor === activeFloor && r.category.includes('Core'));
    if (!existingCore) {
      newRooms.push(createRoomObject("Circulation", "Core"));
    }

    if (targetUser === 'Students') {
      newRooms.push(createRoomObject("Private Communal", "Shared Kitchen"));
      newRooms.push(createRoomObject("Private Communal", "Shared Living Room"));
    } else if (targetUser === 'Young Professional') {
      newRooms.push(createRoomObject("Private Communal", "Library"));
      newRooms.push(createRoomObject("Private Communal", "Concentration Pod"));
      newRooms.push(createRoomObject("Private Communal", "Meeting Room"));
    } else if (targetUser === 'Family') {
      newRooms.push(createRoomObject("Private Communal", "Game Room"));
      newRooms.push(createRoomObject("Private Communal", "Workspace Room"));
    }

    updateRoomsWithHistory([...rooms, ...newRooms]);
  };

  const handleStraighten = async (shouldRandomize = false) => {
    if (rooms.length === 0) return;
    setIsCalculating(true);

    let activeFloorRooms = rooms
        .filter(r => r.floor === activeFloor && !r.id.startsWith('AutoCorridor'))
        .map(r => ({
            ...r,
            pinned: (r.category && r.category.includes('Core')) // Lock ONLY Core
        }));

    const otherFloorRooms = rooms.filter(r => r.floor !== activeFloor);

    if (shouldRandomize) {
        let currentFloorArea = 0;
        let existingBufferCount = 0;

        activeFloorRooms.forEach(r => {
            let area = r.area;
            if (!area) area = getCalculatedRoomAreaM2(r.width, r.height, r.id.split(' (')[0], COMMUNAL_GW_GH, GRID_SIZE);
            currentFloorArea += area;
            
            if (r.category && r.category.includes('Public Buffer Zone')) {
                existingBufferCount++;
            }
        });

        const SITE_AREA = 40 * 30; // 1200 m² total grid available
        const remainingArea = SITE_AREA - currentFloorArea;

        if (remainingArea > 100 && existingBufferCount < 3) {
            let areaToFill = remainingArea * (0.1 + Math.random() * 0.05); 
            const bufferItems = communalComponents["Public Buffer Zone"];
            const shuffledBuffers = [...bufferItems].sort(() => 0.5 - Math.random());

            let addedCount = 0;
            const maxToAddThisClick = Math.floor(Math.random() * 2) + 1; 

            for (const itemName of shuffledBuffers) {
                if (addedCount >= maxToAddThisClick || existingBufferCount >= 3) break;

                const metrics = COMMUNAL_GW_GH[itemName];
                const itemArea = Math.round(metrics.gw * metrics.gh * (metrics.areaFactor || 1));

                if (areaToFill >= itemArea && !activeFloorRooms.some(r => r.category && r.category.includes(itemName))) {
                    const newRoom = createRoomObject('Public Buffer Zone', itemName);
                    newRoom.floor = activeFloor;
                    activeFloorRooms.push(newRoom);
                    areaToFill -= itemArea; 
                    addedCount++;
                    existingBufferCount++;
                }
            }
        }
    }

    const payloadRooms = [...otherFloorRooms, ...activeFloorRooms];

    try {
      const response = await fetch('http://127.0.0.1:8000/api/straighten-walls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUser, activeFloor, rooms: payloadRooms, randomize: shouldRandomize }) 
      });
      const data = await response.json();
      if (data.status === 'success') { 
          updateRoomsWithHistory(data.rooms); 
          setRules(data.rules); 
      }
    } catch (error) { 
        alert("Check backend terminal. Make sure your Python server is running."); 
    }
    setIsCalculating(false);
  };

  const handleDragStop = (room, e, d) => {
    if (room.pinned) return;
    if (e.clientX < 220) { 
      updateRoomsWithHistory(rooms.filter(r => r.id !== room.id)); 
      return; 
    }
    const snapX = Math.round(d.x / SUBGRID_SIZE) * SUBGRID_SIZE;
    const snapY = Math.round(d.y / SUBGRID_SIZE) * SUBGRID_SIZE;
    updateRoomsWithHistory(rooms.map(r => r.id === room.id ? { ...r, x: snapX, y: snapY } : r));
  };

  const handleDrag = (draggedRoom, newX, newY) => {
    if (draggedRoom.pinned) return; 
    setRooms(rooms.map(r => r.id === draggedRoom.id ? { ...r, x: newX, y: newY } : r));
  };

  const togglePin = (roomId) => {
    updateRoomsWithHistory(rooms.map(r => r.id === roomId ? { ...r, pinned: !r.pinned } : r));
  };

  const handleModifyShape = (roomId, action) => {
    const newRooms = rooms.map(r => {
      if (r.id !== roomId || r.pinned) return r;
      const cx = r.x + r.width / 2; const cy = r.y + r.height / 2;
      
      if (action === 'ROTATE') { 
        return { ...r, width: r.height, height: r.width, x: cx - r.height/2, y: cy - r.width/2, rotation: (r.rotation + 90) % 360 };
      } else if (action === 'FLIP') { 
        return { ...r, flipX: !r.flipX };
      } else if (action === 'CYCLE_VARIANT') {
        const itemName = (r.category || "").split(' - ')[1];
        if (CATALOG_DATA[itemName]) {
            const currentCatalog = CATALOG_DATA[itemName];
            const currentIndex = currentCatalog.findIndex(opt => opt.variant === r.shapeVariant);
            const nextOption = currentCatalog[(currentIndex + 1) % currentCatalog.length];
            return { 
                ...r, 
                shapeVariant: nextOption.variant, 
                shapePath: nextOption.path, 
                optName: nextOption.opt, 
                score: nextOption.score,
                width: nextOption.gw * GRID_SIZE,
                height: nextOption.gh * GRID_SIZE,
                area: nextOption.area
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
      if (cat.includes('Studio')) count += 1;
      else if (cat.includes('1 Bedroom')) count += 2;
      else if (cat.includes('2 Bedroom')) count += 3;
      else if (cat.includes('3 Bedroom')) count += 4;
      else if (cat.includes('4 Bedroom')) count += 4;
    });
    return count;
  };

  const metrics = useMemo(() => {
    let circPx = 0; let usablePx = 0;
    rooms.forEach(room => {
      let area = room.area;
      if (area === undefined || area === null || area === 0) {
         area = getCalculatedRoomAreaM2(room.width, room.height, room.id.split(' (')[0], COMMUNAL_GW_GH, GRID_SIZE);
      }
      
      const categoryNameLower = (room.category || "").toLowerCase();
      const isCirculation = categoryNameLower.includes('circulation') || categoryNameLower.includes('corridor') || room.id.includes('Corridor');
      if (isCirculation) {
        circPx += area; 
      } else {
        usablePx += area;
      }
    });
    const totalM2 = circPx + usablePx;
    return { circM2: Math.round(circPx), usableM2: Math.round(usablePx), totalM2: Math.round(totalM2), efficiency: totalM2 === 0 ? 0 : Math.round((usablePx / totalM2) * 100) };
  }, [rooms]);

  const handleExportJSON = () => {
    const exportData = { rooms: rooms.map(r => ({ id: r.id, category: r.category, floor: r.floor, rotation: r.rotation, flipX: r.flipX, shapeVariant: r.shapeVariant, coordinates: { x: r.x, y: r.y } })) };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'layout.json'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleExportOBJ = () => {
    if (!sceneRef.current) return alert("3D Scene not loaded yet.");
    const exporter = new OBJExporter();
    const result = exporter.parse(sceneRef.current);
    const blob = new Blob([result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'massing_model.obj'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Lato', sans-serif", background: '#121212' }}>
      
      {/* Top Navigation Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e1e1e', color: 'white', padding: '15px 30px', borderBottom: '1px solid #333', zIndex: 999 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={handleUndo} disabled={historyStep === 0} style={{ padding: '8px 12px', background: historyStep === 0 ? '#333' : '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>&#x21A9;</button>
            <button onClick={handleRedo} disabled={historyStep === history.length - 1} style={{ padding: '8px 12px', background: historyStep === history.length - 1 ? '#333' : '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>&#x21AA;</button>
          </div>
          <h2 style={{ margin: 0, letterSpacing: '1px', fontSize: '20px', fontWeight: '900' }}>Generative Layout Engine</h2>
        </div>
        
        <div style={{ display: 'flex', gap: '30px', alignItems: 'center', background: '#242424', padding: '5px 15px', borderRadius: '8px', border: '1px solid #444' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '13px', color: '#aaa', fontWeight: 'bold' }}>Target User:</label>
            <select value={targetUser} onChange={(e) => setTargetUser(e.target.value)} style={{ padding: '8px', borderRadius: '4px', background: '#333', color: 'white', border: '1px solid #555', fontFamily: "'Lato', sans-serif" }}>
              <option value="Students">Students</option>
              <option value="Young Professional">Young Professional</option>
              <option value="Family">Family</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '13px', color: '#aaa', fontWeight: 'bold' }}>Residents:</label>
            <input type="number" value={population} onChange={(e) => setPopulation(e.target.value)} style={{ padding: '8px', borderRadius: '4px', background: '#333', color: 'white', border: '1px solid #555', width: '60px' }} />
            <button onClick={handleAutoPopulate} style={{ padding: '8px 15px', background: '#9c27b0', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Auto-Populate</button>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '15px' }}>
          <div style={{ display: 'flex', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
            <button onClick={() => setViewMode('2D')} style={{ padding: '10px 20px', background: viewMode === '2D' ? '#4caf50' : 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>2D PLAN</button>
            <button onClick={() => setViewMode('3D')} style={{ padding: '10px 20px', background: viewMode === '3D' ? '#e91e63' : 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>3D VIEW</button>
          </div>
          {viewMode === '2D' && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => handleStraighten(true)} disabled={isCalculating} style={{ padding: '10px 15px', background: isCalculating ? '#555' : '#9c27b0', color: 'white', border: 'none', borderRadius: '4px', cursor: isCalculating ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                {isCalculating ? 'Processing...' : 'Randomize'}
              </button>
              <button onClick={() => handleStraighten(false)} disabled={isCalculating} style={{ padding: '10px 25px', background: isCalculating ? '#555' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: isCalculating ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                {isCalculating ? 'Calculating...' : 'Auto-Layout'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        
        {/* Left Data & Floor Panel */}
        <div style={{ width: '240px', flexShrink: 0, background: '#1a1a1a', borderRight: '1px solid #333', padding: '20px', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
          <h3 style={{ color: 'white', marginTop: 0, letterSpacing: '1px', marginBottom: '20px' }}>FLOORS</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
            {floors.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <button onClick={() => setActiveFloor(f)} style={{ flex: 1, padding: '10px', background: activeFloor === f ? '#007bff' : '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Floor {f}</button>
                <button onClick={() => handleDeleteFloor(f)} style={{ background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', padding: '10px', cursor: 'pointer' }}>X</button>
              </div>
            ))}
          </div>
          <button onClick={handleAddFloor} style={{ padding: '10px', background: 'transparent', color: '#4caf50', border: '1px dashed #4caf50', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Floor</button>
          
          <div style={{ marginTop: '25px', padding: '15px', background: '#242424', borderRadius: '8px', border: '1px solid #444', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
            <h4 style={{ color: '#aaa', margin: '0 0 15px 0', fontSize: '12px', letterSpacing: '1px' }}>DATA ANALYTICS</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}><span style={{ color: '#888' }}>Total Area:</span><span style={{ color: 'white', fontWeight: 'bold' }}>{metrics.totalM2} m²</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}><span style={{ color: '#4caf50' }}>Usable Space:</span><span style={{ color: 'white', fontWeight: 'bold' }}>{metrics.usableM2} m²</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontSize: '13px' }}><span style={{ color: '#9c27b0' }}>Circulation:</span><span style={{ color: 'white', fontWeight: 'bold' }}>{metrics.circM2} m²</span></div>
            
            <div style={{ width: '100%', background: '#333', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '5px' }}>
              <div style={{ width: `${metrics.efficiency}%`, background: metrics.efficiency >= 75 ? '#4caf50' : (metrics.efficiency >= 60 ? '#ff9800' : '#f44336'), height: '100%', transition: 'width 0.3s' }}></div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px', color: '#aaa', marginBottom: '15px' }}>Efficiency: <span style={{ color: metrics.efficiency >= 75 ? '#4caf50' : '#ff9800', fontWeight: 'bold' }}>{metrics.efficiency}%</span></div>
            <button onClick={handleExportJSON} style={{ width: '100%', padding: '10px', background: 'rgba(255, 179, 0, 0.1)', color: '#ffb300', border: '1px solid #ffb300', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', transition: 'background 0.2s' }} onMouseOver={(e) => e.target.style.background = 'rgba(255, 179, 0, 0.2)'} onMouseOut={(e) => e.target.style.background = 'rgba(255, 179, 0, 0.1)'}>
              Export JSON Data
            </button>
          </div>

          {viewMode === '2D' && (
            <div style={{ marginTop: '15px', padding: '15px', background: '#242424', borderRadius: '8px', border: '1px solid #444', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
              <h4 style={{ color: '#aaa', margin: '0 0 12px 0', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Connection Logic</h4>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ width: '25px', borderBottom: '3px dashed #4caf50', marginRight: '10px' }}></div>
                <span style={{ color: '#ccc', fontSize: '11px', lineHeight: '1.4' }}>
                  <b style={{ color: '#4caf50' }}>Rule Satisfied</b><br/>Rooms perfectly adjacent.
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '25px', borderBottom: '3px dashed #f44336', marginRight: '10px' }}></div>
                <span style={{ color: '#ccc', fontSize: '11px', lineHeight: '1.4' }}>
                  <b style={{ color: '#f44336' }}>Rule Broken</b><br/>Rooms are too far apart.
                </span>
              </div>
            </div>
          )}

          {viewMode === '2D' && (
            <div style={{ marginTop: '20px', position: 'relative', width: '100%', height: TRASH_SIZE, flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: '2px dashed #f44336', borderRadius: '8px', background: 'rgba(244, 67, 54, 0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#f44336', fontWeight: 'bold', textAlign: 'center' }}>
                <span style={{ fontSize: '11px' }}>Drop here<br/>to delete</span>
              </div>
            </div>
          )}
        </div>

        {/* Main Workspace */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {viewMode === '3D' ? (
            <div style={{ width: '100%', height: '100%', background: '#111' }}>
              <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10 }}>
                <div style={{ background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                    <h3 style={{ color: 'white', margin: '0 0 5px 0' }}>3D Massing Model</h3>
                    <p style={{ margin: 0, fontSize: '12px', color: '#ccc' }}>Left Click = Orbit | Right Click = Pan | Scroll = Zoom</p>
                    <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#ffb300', fontWeight: 'bold' }}>Read-only visualization mode.</p>
                </div>
                <button onClick={handleExportOBJ} style={{ padding: '8px 15px', background: '#e91e63', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Export .OBJ</button>
              </div>
              <Canvas camera={CAMERA_SETTINGS}>
                <SceneCapturer sceneRef={sceneRef} />
                <ambientLight intensity={0.7} />
                <directionalLight position={[20, 50, 20]} intensity={1} castShadow />
                <OrbitControls />
                <gridHelper args={[150, 150, '#555', '#222']} position={[0, -0.1, 0]} />
                <group>{rooms.map(room => <ModularMesh key={`3d-${room.id}`} room={room} scale={GRID_SIZE} floorHeight={3.2} />)}</group>
              </Canvas>
            </div>
          ) : (
            <div style={{ display: 'flex', flex: 1, padding: '20px', background: '#242424', overflowX: 'auto', gap: '20px', position: 'relative' }}>
              {floors.map(floor => (
                <div key={floor} style={{ 
                  position: 'relative', width: '800px', height: '600px', flexShrink: 0, 
                  background: '#2a2a2a', border: '1px solid #444', borderRadius: '12px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  backgroundImage: `
                    linear-gradient(to right, #555 1px, transparent 1px),
                    linear-gradient(to bottom, #555 1px, transparent 1px),
                    linear-gradient(to right, #333 1px, transparent 1px),
                    linear-gradient(to bottom, #333 1px, transparent 1px)
                  `,
                  backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px, ${GRID_SIZE}px ${GRID_SIZE}px, ${SUBGRID_SIZE}px ${SUBGRID_SIZE}px, ${SUBGRID_SIZE}px ${SUBGRID_SIZE}px`,
                  backgroundPosition: '0 0, 0 0, 0 0, 0 0'
                }}>
                  
                  <div style={{ position: 'absolute', top: '20px', left: '20px', color: '#888', fontWeight: 'bold', fontSize: '18px', zIndex: 2, display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span>FLOOR {floor} {activeFloor === floor && <span style={{ color: '#007bff', fontSize: '14px' }}>(Active)</span>}</span>
                    <span style={{ fontSize: '12px', background: '#333', color: '#ccc', padding: '4px 8px', borderRadius: '4px', border: '1px solid #444' }}>
                      Residents: {getResidentsForFloor(floor)}
                    </span>
                    <button onClick={() => handleResetFloor(floor)} style={{ padding: '4px 10px', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', marginLeft: '10px' }}>
                      Reset Floor
                    </button>
                  </div>

                  <div style={{ position: 'absolute', top: '60px', left: '20px', right: '20px', bottom: '20px', border: '2px dashed #666', borderRadius: '8px', pointerEvents: 'none', display: 'flex', alignItems: 'flex-end', padding: '15px', zIndex: 1, background: 'rgba(42,42,42,0.2)' }}>
                    <span style={{ color: '#555', fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px' }}>SITE BOUNDARY</span>
                  </div>

                  <div style={{ position: 'absolute', top: '20px', right: '20px', color: '#ccc', fontSize: '11px', fontWeight: 'bold', zIndex: 2, background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: '4px', textAlign: 'right', lineHeight: '1.5' }}>
                    <span style={{color: '#ffb300'}}>Double-Click:</span> Lock/Pin<br/>
                    <span style={{color: '#ffb300'}}>Right-Click:</span> Rotate<br/>
                    <span style={{color: '#ffb300'}}>Shift + Right-Click:</span> Flip (Mirror)<br/>
                    <span style={{color: '#ffb300'}}>Middle-Click:</span> Cycle Shape Variant
                  </div>

                  <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
                    {rules.filter(r => r.floor === floor).map((rule, idx) => {
                      const r1 = rooms.find(r => r.id === rule.source);
                      const r2 = rooms.find(r => r.id === rule.target);
                      if (!r1 || !r2) return null;
                      const x1 = r1.x + r1.width / 2; const y1 = r1.y + r1.height / 2;
                      const x2 = r2.x + r2.width / 2; const y2 = r2.y + r2.height / 2;
                      const dx = Math.max(0, r1.x - (r2.x + r2.width), r2.x - (r1.x + r1.width));
                      const dy = Math.max(0, r1.y - (r2.y + r2.height), r2.y - (r1.y + r1.height));
                      const edgeDist = Math.sqrt(dx*dx + dy*dy);
                      let color = '#555'; let strokeDasharray = '0';
                      if (rule.weight >= 2.0) { color = edgeDist <= 25 ? '#4caf50' : '#f44336'; strokeDasharray = '5, 5'; } 
                      else if (rule.weight === 0.0) { color = edgeDist < 80 ? '#f44336' : '#4caf50'; if (edgeDist >= 80) return null; strokeDasharray = '10, 10'; }
                      return <line key={idx} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="3" strokeDasharray={strokeDasharray} />
                    })}
                    <defs>
                        <pattern id="grid_1m" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                            <line x1="0" y1="0" x2={GRID_SIZE} y2="0" stroke="#555" strokeWidth="0.5" />
                            <line x1="0" y1="0" x2="0" y2={GRID_SIZE} stroke="#555" strokeWidth="0.5" />
                        </pattern>
                        <pattern id="grid_50cm" width={SUBGRID_SIZE} height={SUBGRID_SIZE} patternUnits="userSpaceOnUse">
                            <line x1="0" y1="0" x2={SUBGRID_SIZE} y2="0" stroke="#333" strokeWidth="0.25" />
                            <line x1="0" y1="0" x2="0" y2={SUBGRID_SIZE} stroke="#333" strokeWidth="0.25" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid_50cm)" opacity="0.15" />
                    <rect width="100%" height="100%" fill="url(#grid_1m)" opacity="0.3" />
                  </svg>

                  {rooms.filter(r => r.floor === floor).map(room => {
                    const isRotated = room.rotation === 90 || room.rotation === 270;
                    let displayName = room.id.split(' (')[0];
                    if (displayName.startsWith('AutoCorridor')) displayName = 'Corridor';

                    const displayArea = room.area === undefined || room.area === null || room.area === 0 ? 
                        getCalculatedRoomAreaM2(room.width, room.height, room.id.split(' (')[0], COMMUNAL_GW_GH, GRID_SIZE) : 
                        room.area;

                    return (
                      <Rnd key={room.id} size={{ width: room.width, height: room.height }} position={{ x: room.x, y: room.y }} dragGrid={[SUBGRID_SIZE, SUBGRID_SIZE]} resizeGrid={[SUBGRID_SIZE, SUBGRID_SIZE]} onDrag={(e, d) => handleDrag(room, d.x, d.y)} onDragStop={(e, d) => handleDragStop(room, e, d)} onResizeStop={(e, direction, ref, delta, pos) => {
                          if (room.pinned) return;
                          const snapW = Math.max(GRID_SIZE, Math.round(parseInt(ref.style.width) / SUBGRID_SIZE) * SUBGRID_SIZE);
                          const snapH = Math.max(GRID_SIZE, Math.round(parseInt(ref.style.height) / SUBGRID_SIZE) * SUBGRID_SIZE);
                          
                          const newArea = getCalculatedRoomAreaM2(snapW, snapH, room.id.split(' (')[0], COMMUNAL_GW_GH, GRID_SIZE);

                          updateRoomsWithHistory(rooms.map(r => r.id === room.id ? { ...r, width: snapW, height: snapH, x: Math.round(pos.x / SUBGRID_SIZE) * SUBGRID_SIZE, y: Math.round(pos.y / SUBGRID_SIZE) * SUBGRID_SIZE, area: newArea } : r));
                      }} onDoubleClick={() => togglePin(room.id)} onContextMenu={(e) => { e.preventDefault(); handleModifyShape(room.id, e.shiftKey ? 'FLIP' : 'ROTATE'); }} onMouseDown={(e) => { 
     if(e.button === 1) { 
    e.preventDefault();   // Stops the browser's auto-scroll tool
    e.stopPropagation();  // Stops react-rnd from trying to drag
    handleModifyShape(room.id, 'CYCLE_VARIANT'); 
  } 
}} style={{ zIndex: 10, cursor: room.pinned ? 'not-allowed' : 'grab' }}>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', width: isRotated ? room.height : room.width, height: isRotated ? room.width : room.height, transform: `translate(-50%, -50%) rotate(${room.rotation}deg)`, pointerEvents: 'none', filter: room.pinned ? 'drop-shadow(0 0 8px rgba(255, 82, 82, 0.6))' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))' }}>
                          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', transform: room.flipX ? 'scaleX(-1)' : 'none', transformOrigin: 'center', overflow: 'visible' }}>
                            <polygon points={room.shapePath} fill={room.bgColor} stroke={room.pinned ? '#ff5252' : room.borderColor} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                          </svg>
                        </div>
                        <div style={roomLabelContainerStyle}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>{displayName}</span>
                          <span style={{ fontSize: '10px', opacity: 0.9, textShadow: '1px 1px 2px rgba(0,0,0,0.8)', marginTop: '2px' }}>{displayArea} m²</span>
                          {room.optName && room.optName !== "Custom" && <span style={{ fontSize: '8px', opacity: 0.7, textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>{room.optName}</span>}
                          {room.score && <span style={{ fontSize: '8px', color: '#4caf50', background: 'rgba(0,0,0,0.4)', padding: '2px', borderRadius: '2px', marginTop: '2px' }}>Score: {room.score}</span>}
                          {room.pinned && <span style={{ fontSize: '10px', color: '#ff5252', fontWeight: 'bold', marginTop: '6px', letterSpacing: '1px', background: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: '2px' }}>LOCKED</span>}
                        </div>
                      </Rnd>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Floating Catalog Modal absolutely positioned to the edge of the center container */}
          {activeCatalogContext && (
            <div style={{ position: 'absolute', right: '10px', top: '20px', width: '320px', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto', background: 'rgba(10, 10, 10, 0.95)', border: '1px solid #4da3ff', borderRadius: '12px', padding: '15px', zIndex: 100, boxShadow: '-10px 10px 40px rgba(0,0,0,0.8)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white', marginBottom: '15px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#4da3ff' }}>{activeCatalogContext} Catalog</h3>
                  <button onClick={() => setActiveCatalogContext(null)} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}>✕</button>
              </div>
              {CATALOG_DATA[activeCatalogContext].map((opt, i) => (
                <div key={i} onClick={() => handleAddCatalogRoom("Residential Unit", activeCatalogContext, opt)} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', borderRadius: '0', padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px', transition: 'all 0.2s', marginBottom: '5px' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.7)'; e.currentTarget.style.borderColor = '#4da3ff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}>
                  <div style={{ width: '40px', height: '40px', background: 'rgba(77, 163, 255, 0.1)', borderRadius: '4px' }}>
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                        <polygon points={opt.path} fill="rgba(77, 163, 255, 0.5)" stroke="#4da3ff" strokeWidth="4" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                      <div style={{ color: 'white', fontSize: '12px', fontWeight: 'bold', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>{opt.opt}</div>
                      <div style={{ color: '#aaa', fontSize: '10px', marginTop: '4px' }}>Area: {opt.area} m²</div>
                      <div style={{ color: '#4caf50', fontSize: '10px', fontWeight: 'bold', marginTop: '2px' }}>Score: {opt.score}</div>
                  </div>
                  <div style={{ color: '#4da3ff', fontWeight: 'bold', fontSize: '18px' }}>+</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Manual Library */}
        <div style={{ width: '300px', flexShrink: 0, background: '#1a1a1a', borderLeft: '1px solid #333', padding: '20px', overflowY: 'auto', zIndex: 10 }}>
          <h3 style={{ color: 'white', marginTop: 0, letterSpacing: '1px', marginBottom: '20px' }}>Component Library</h3>
          
          <div style={{ marginBottom: '25px' }}>
            <div style={{ color: '#aaa', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>Circulation</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {communalComponents["Circulation"].map((itemName) => {
                const colors = getColors('Circulation');
                return (
                  <button key={itemName} onClick={() => handleAddRoom('Circulation', itemName)} style={{ padding: '10px', background: '#2a2a2a', color: 'white', border: `1px solid ${colors.border}`, borderLeft: `5px solid ${colors.border}`, borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', fontSize: '13px', transition: 'background 0.2s' }} onMouseOver={(e) => e.target.style.background = '#333'} onMouseOut={(e) => e.target.style.background = '#2a2a2a'}>
                    + {itemName}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginBottom: '25px' }}>
            <div style={{ color: '#aaa', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>Residential Unit Catalog</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {residentialComponents.map(itemName => {
                const isActive = activeCatalogContext === itemName;
                const colors = getColors('Residential Unit');
                return (
                  <button key={itemName} onClick={() => setActiveCatalogContext(isActive ? null : itemName)} style={{ padding: '10px', background: isActive ? '#333' : '#2a2a2a', color: 'white', border: `1px solid ${isActive ? '#4da3ff' : colors.border}`, borderLeft: `5px solid ${isActive ? '#4da3ff' : colors.border}`, borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', fontSize: '13px', transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between' }} onMouseOver={(e) => e.currentTarget.style.background = '#333'} onMouseOut={(e) => e.currentTarget.style.background = isActive ? '#333' : '#2a2a2a'}>
                    <span>Browse {itemName}</span>
                    <span style={{ color: isActive ? '#4da3ff' : '#aaa', transform: isActive ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>&lt;</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginBottom: '25px' }}>
            <div style={{ color: '#aaa', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>Private Communal</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {communalComponents["Private Communal"].map((itemName) => {
                const colors = getColors('Private Communal');
                return (
                  <button key={itemName} onClick={() => handleAddRoom('Private Communal', itemName)} style={{ padding: '10px', background: '#2a2a2a', color: 'white', border: `1px solid ${colors.border}`, borderLeft: `5px solid ${colors.border}`, borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', fontSize: '13px', transition: 'background 0.2s' }} onMouseOver={(e) => e.target.style.background = '#333'} onMouseOut={(e) => e.target.style.background = '#2a2a2a'}>
                    + {itemName}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginBottom: '25px' }}>
            <div style={{ color: '#aaa', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>Public Buffer Zone</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {communalComponents["Public Buffer Zone"].map((itemName) => {
                const colors = getColors('Public Buffer Zone');
                return (
                  <button key={itemName} onClick={() => handleAddRoom('Public Buffer Zone', itemName)} style={{ padding: '10px', background: '#2a2a2a', color: 'white', border: `1px solid ${colors.border}`, borderLeft: `5px solid ${colors.border}`, borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', fontSize: '13px', transition: 'background 0.2s' }} onMouseOver={(e) => e.target.style.background = '#333'} onMouseOut={(e) => e.target.style.background = '#2a2a2a'}>
                    + {itemName}
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;