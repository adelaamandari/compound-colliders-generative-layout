import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ============================================================
// DESIGN TOKENS
// ============================================================
const T = {
  bg:          '#f0ede8',
  panel:       '#e6e2db',
  card:        '#faf9f6',
  border:      '#ccc8c0',
  borderLight: '#dedad2',
  text:        '#1e1c19',
  textSub:     '#6e6a62',
  textTiny:    '#a09c94',
  accent:      '#8a3a2e',
  accentSoft:  'rgba(138,58,46,0.10)',
  gridLine:    'rgba(0,0,0,0.05)',
  gridMajor:   'rgba(0,0,0,0.10)',
  void:        'rgba(0,0,0,0.06)',
};

const RC = {
  core:      '#c4bfb8',
  stairs:    '#b0a8a0',
  corridor:  '#d4cfc8',
  studio:    '#b8c4cc',
  bed1:      '#a8b8c4',
  bed2:      '#98a8b8',
  bed3:      '#8898ac',
  bed4:      '#7888a0',
  kitchen:   '#b8c4b4',
  living:    '#c8d0c0',
  garden:    '#b4c4b0',
  gym:       '#c4b8b8',
  library:   '#c8c0b0',
  workspace: '#c0beb4',
  meeting:   '#bcc4b8',
  play:      '#c8bcb4',
  mhall:     '#b8b4c4',
  cinema:    '#c0b8c4',
  lift:      '#9a3a30',
  communal:  '#d4aca8',
};

const API = 'http://127.0.0.1:8000';

function buildGrid(w, h, defs) {
  const g = Array.from({ length: h }, () => Array(w).fill(null));
  defs.forEach(d => { g[d.r][d.c] = { label: d.label, color: d.color }; });
  return g;
}

// ============================================================
// CLUSTER LIBRARY — keys must match CLUSTER_TYPES in backend
// Shapes are read from the reference image (image 2):
//   Family    : wide H — left 3-bed wing, right 2-bed wing, top/bottom arms, centre spine
//   Hybrid    : staircase / L-steps — blocks cascade down-right
//   Professional: diagonal offset cross — rooms stagger diagonally
//   Student   : compact symmetric cross
//   Hybrid2   : thin + cross — single-cell-wide arms from centre core
// All grids are 9 wide x 7 tall. Null cells are transparent (open space).
// ============================================================
const CLUSTER_LIBRARY = {
  // ── FAMILY: H-shape. Left 3×3 wing | 3-col centre spine | right 3×3 wing
  //           + 3-wide top arm and 3-wide bottom arm on the centre spine
  Family: {
    label: 'Family Cluster',
    description: '3-bed & 2-bed units, garden + play wings',
    gridW: 9, gridH: 7,
    typeColor: { fill: '#c8c0b4', stroke: '#9a9088', text: '#3a3028' },
    cells: buildGrid(9, 7, [
      // Left wing (cols 0-2, rows 1-5)
      { r:1,c:0,label:'Garden',color:RC.garden }, { r:1,c:1,label:'Garden',color:RC.garden }, { r:1,c:2,label:'3 Bed',color:RC.bed3 },
      { r:2,c:0,label:'Garden',color:RC.garden }, { r:2,c:1,label:'Core',color:RC.core },    { r:2,c:2,label:'3 Bed',color:RC.bed3 },
      { r:3,c:0,label:'Garden',color:RC.garden }, { r:3,c:1,label:'Stair',color:RC.stairs }, { r:3,c:2,label:'3 Bed',color:RC.bed3 },
      { r:4,c:0,label:'Garden',color:RC.garden }, { r:4,c:1,label:'Core',color:RC.core },    { r:4,c:2,label:'3 Bed',color:RC.bed3 },
      { r:5,c:0,label:'Play',color:RC.play },     { r:5,c:1,label:'Play',color:RC.play },    { r:5,c:2,label:'3 Bed',color:RC.bed3 },
      // Centre spine (cols 3-5, all rows)
      { r:0,c:3,label:'2 Bed',color:RC.bed2 },  { r:0,c:4,label:'2 Bed',color:RC.bed2 },  { r:0,c:5,label:'2 Bed',color:RC.bed2 },
      { r:1,c:3,label:'Lift',color:RC.lift },   { r:1,c:4,label:'Communal',color:RC.communal }, { r:1,c:5,label:'Lift',color:RC.lift },
      { r:2,c:3,label:'Core',color:RC.core },   { r:2,c:4,label:'Corridor',color:RC.corridor }, { r:2,c:5,label:'Core',color:RC.core },
      { r:3,c:3,label:'Lift',color:RC.lift },   { r:3,c:4,label:'Communal',color:RC.communal }, { r:3,c:5,label:'Lift',color:RC.lift },
      { r:4,c:3,label:'Core',color:RC.core },   { r:4,c:4,label:'Corridor',color:RC.corridor }, { r:4,c:5,label:'Core',color:RC.core },
      { r:5,c:3,label:'Lift',color:RC.lift },   { r:5,c:4,label:'Communal',color:RC.communal }, { r:5,c:5,label:'Lift',color:RC.lift },
      { r:6,c:3,label:'2 Bed',color:RC.bed2 },  { r:6,c:4,label:'2 Bed',color:RC.bed2 },  { r:6,c:5,label:'2 Bed',color:RC.bed2 },
      // Right wing (cols 6-8, rows 1-5)
      { r:1,c:6,label:'2 Bed',color:RC.bed2 }, { r:1,c:7,label:'2 Bed',color:RC.bed2 }, { r:1,c:8,label:'Library',color:RC.library },
      { r:2,c:6,label:'2 Bed',color:RC.bed2 }, { r:2,c:7,label:'Stair',color:RC.stairs },{ r:2,c:8,label:'Library',color:RC.library },
      { r:3,c:6,label:'2 Bed',color:RC.bed2 }, { r:3,c:7,label:'Core',color:RC.core },   { r:3,c:8,label:'Library',color:RC.library },
      { r:4,c:6,label:'2 Bed',color:RC.bed2 }, { r:4,c:7,label:'Stair',color:RC.stairs },{ r:4,c:8,label:'Library',color:RC.library },
      { r:5,c:6,label:'2 Bed',color:RC.bed2 }, { r:5,c:7,label:'2 Bed',color:RC.bed2 }, { r:5,c:8,label:'Library',color:RC.library },
    ]),
  },

  // ── HYBRID: Staircase — large blocks stepping down-right in 3 steps
  Hybrid: {
    label: 'Hybrid Cluster',
    description: 'Mixed tenures: studio, 1-bed, 2-bed + communal hall',
    gridW: 9, gridH: 7,
    typeColor: { fill: '#c4bec8', stroke: '#907898', text: '#302838' },
    cells: buildGrid(9, 7, [
      // Top-left block (rows 0-2, cols 0-4)
      { r:0,c:0,label:'Studio',color:RC.studio }, { r:0,c:1,label:'Studio',color:RC.studio }, { r:0,c:2,label:'M.Hall',color:RC.mhall },  { r:0,c:3,label:'Lift',color:RC.lift },    { r:0,c:4,label:'2 Bed',color:RC.bed2 },
      { r:1,c:0,label:'Studio',color:RC.studio }, { r:1,c:1,label:'Stair',color:RC.stairs },  { r:1,c:2,label:'M.Hall',color:RC.mhall },  { r:1,c:3,label:'Core',color:RC.core },   { r:1,c:4,label:'2 Bed',color:RC.bed2 },
      { r:2,c:0,label:'Studio',color:RC.studio }, { r:2,c:1,label:'Studio',color:RC.studio }, { r:2,c:2,label:'M.Hall',color:RC.mhall },  { r:2,c:3,label:'Communal',color:RC.communal },{ r:2,c:4,label:'Kitchen',color:RC.kitchen },
      // Middle block (rows 2-4, cols 3-7)
      { r:2,c:5,label:'Lift',color:RC.lift },    { r:2,c:6,label:'Cinema',color:RC.cinema }, { r:2,c:7,label:'1 Bed',color:RC.bed1 },
      { r:3,c:3,label:'Corridor',color:RC.corridor },{ r:3,c:4,label:'Communal',color:RC.communal },{ r:3,c:5,label:'Core',color:RC.core }, { r:3,c:6,label:'Cinema',color:RC.cinema },{ r:3,c:7,label:'1 Bed',color:RC.bed1 },
      { r:4,c:3,label:'Lift',color:RC.lift },    { r:4,c:4,label:'Studio',color:RC.studio }, { r:4,c:5,label:'Stair',color:RC.stairs },  { r:4,c:6,label:'Cinema',color:RC.cinema },{ r:4,c:7,label:'1 Bed',color:RC.bed1 },
      // Bottom-right block (rows 4-6, cols 5-8)
      { r:4,c:8,label:'1 Bed',color:RC.bed1 },
      { r:5,c:5,label:'Gym',color:RC.gym },     { r:5,c:6,label:'Gym',color:RC.gym },     { r:5,c:7,label:'1 Bed',color:RC.bed1 },  { r:5,c:8,label:'1 Bed',color:RC.bed1 },
      { r:6,c:5,label:'Gym',color:RC.gym },     { r:6,c:6,label:'Studio',color:RC.studio },{ r:6,c:7,label:'Studio',color:RC.studio },{ r:6,c:8,label:'Studio',color:RC.studio },
    ]),
  },

  // ── PROFESSIONAL: diagonal cross — rooms stagger diagonally top-left to bottom-right
  Professional: {
    label: 'Professional Cluster',
    description: '1-bed & 2-bed units, library + workspace wings',
    gridW: 9, gridH: 7,
    typeColor: { fill: '#bec4c0', stroke: '#809088', text: '#283430' },
    cells: buildGrid(9, 7, [
      // Top-left arm (rows 0-1, cols 0-2)
      { r:0,c:0,label:'1 Bed',color:RC.bed1 },  { r:0,c:1,label:'1 Bed',color:RC.bed1 },  { r:0,c:2,label:'Library',color:RC.library },
      { r:1,c:0,label:'1 Bed',color:RC.bed1 },  { r:1,c:1,label:'Stair',color:RC.stairs }, { r:1,c:2,label:'Library',color:RC.library },
      // Centre-left block (rows 1-4, cols 1-4)
      { r:1,c:3,label:'Lift',color:RC.lift },    { r:1,c:4,label:'Communal',color:RC.communal },
      { r:2,c:1,label:'Meeting',color:RC.meeting },{ r:2,c:2,label:'Meeting',color:RC.meeting },{ r:2,c:3,label:'Core',color:RC.core },   { r:2,c:4,label:'Corridor',color:RC.corridor },{ r:2,c:5,label:'Lift',color:RC.lift },
      { r:3,c:1,label:'Meeting',color:RC.meeting },{ r:3,c:2,label:'Core',color:RC.core },   { r:3,c:3,label:'Communal',color:RC.communal },{ r:3,c:4,label:'Core',color:RC.core },     { r:3,c:5,label:'WorkPod',color:RC.workspace },
      { r:4,c:2,label:'Stair',color:RC.stairs }, { r:4,c:3,label:'Lift',color:RC.lift },    { r:4,c:4,label:'Corridor',color:RC.corridor },{ r:4,c:5,label:'WorkPod',color:RC.workspace },{ r:4,c:6,label:'2 Bed',color:RC.bed2 },
      // Centre-right block (rows 3-5, cols 5-7)
      { r:3,c:6,label:'2 Bed',color:RC.bed2 },  { r:3,c:7,label:'ConPod',color:RC.workspace },
      { r:5,c:5,label:'WorkPod',color:RC.workspace },{ r:5,c:6,label:'2 Bed',color:RC.bed2 },  { r:5,c:7,label:'ConPod',color:RC.workspace },{ r:5,c:8,label:'2 Bed',color:RC.bed2 },
      // Bottom-right arm (rows 5-6, cols 6-8)
      { r:6,c:6,label:'2 Bed',color:RC.bed2 },  { r:6,c:7,label:'2 Bed',color:RC.bed2 },  { r:6,c:8,label:'2 Bed',color:RC.bed2 },
    ]),
  },

  // ── STUDENT: compact symmetric cross — 3×3 centre + single-row arms
  Student: {
    label: 'Student Cluster',
    description: 'Studios packed around shared kitchen + living core',
    gridW: 9, gridH: 7,
    typeColor: { fill: '#bec4cc', stroke: '#7888a0', text: '#283040' },
    cells: buildGrid(9, 7, [
      // Top arm (rows 0-1, cols 3-5)
      { r:0,c:3,label:'Studio',color:RC.studio }, { r:0,c:4,label:'Studio',color:RC.studio }, { r:0,c:5,label:'Studio',color:RC.studio },
      { r:1,c:3,label:'Studio',color:RC.studio }, { r:1,c:4,label:'Kitchen',color:RC.kitchen },{ r:1,c:5,label:'Studio',color:RC.studio },
      // Left arm (rows 2-4, cols 0-2)
      { r:2,c:0,label:'Studio',color:RC.studio }, { r:2,c:1,label:'Studio',color:RC.studio }, { r:2,c:2,label:'Stair',color:RC.stairs },
      { r:3,c:0,label:'Studio',color:RC.studio }, { r:3,c:1,label:'Living',color:RC.living }, { r:3,c:2,label:'Core',color:RC.core },
      { r:4,c:0,label:'Studio',color:RC.studio }, { r:4,c:1,label:'Studio',color:RC.studio }, { r:4,c:2,label:'Stair',color:RC.stairs },
      // Centre block (rows 2-4, cols 3-5)
      { r:2,c:3,label:'Lift',color:RC.lift },    { r:2,c:4,label:'Communal',color:RC.communal }, { r:2,c:5,label:'Lift',color:RC.lift },
      { r:3,c:3,label:'Core',color:RC.core },    { r:3,c:4,label:'Corridor',color:RC.corridor }, { r:3,c:5,label:'Core',color:RC.core },
      { r:4,c:3,label:'Lift',color:RC.lift },    { r:4,c:4,label:'Communal',color:RC.communal }, { r:4,c:5,label:'Lift',color:RC.lift },
      // Right arm (rows 2-4, cols 6-8)
      { r:2,c:6,label:'Stair',color:RC.stairs }, { r:2,c:7,label:'Studio',color:RC.studio }, { r:2,c:8,label:'Studio',color:RC.studio },
      { r:3,c:6,label:'Core',color:RC.core },    { r:3,c:7,label:'Living',color:RC.living }, { r:3,c:8,label:'Studio',color:RC.studio },
      { r:4,c:6,label:'Stair',color:RC.stairs }, { r:4,c:7,label:'Studio',color:RC.studio }, { r:4,c:8,label:'Studio',color:RC.studio },
      // Bottom arm (rows 5-6, cols 3-5)
      { r:5,c:3,label:'Studio',color:RC.studio }, { r:5,c:4,label:'Kitchen',color:RC.kitchen },{ r:5,c:5,label:'Studio',color:RC.studio },
      { r:6,c:3,label:'Studio',color:RC.studio }, { r:6,c:4,label:'Studio',color:RC.studio }, { r:6,c:5,label:'Studio',color:RC.studio },
    ]),
  },

  // ── HYBRID2: thin "+" cross — 1-cell-wide arms extending from 3×3 centre
  Hybrid2: {
    label: 'Hybrid 2 Cluster',
    description: 'Plus-shaped core — single-width arms, shared communal centre',
    gridW: 9, gridH: 7,
    typeColor: { fill: '#c8c4b8', stroke: '#8a8270', text: '#30281c' },
    cells: buildGrid(9, 7, [
      // Top arm — single col 4, rows 0-1
      { r:0,c:4,label:'Studio',color:RC.studio },
      { r:1,c:4,label:'Kitchen',color:RC.kitchen },
      // Left arm — single row 3, cols 0-2
      { r:3,c:0,label:'Studio',color:RC.studio },
      { r:3,c:1,label:'1 Bed',color:RC.bed1 },
      { r:3,c:2,label:'Stair',color:RC.stairs },
      // Centre 3×3 block (rows 2-4, cols 3-5)
      { r:2,c:3,label:'Lift',color:RC.lift },    { r:2,c:4,label:'Communal',color:RC.communal }, { r:2,c:5,label:'Lift',color:RC.lift },
      { r:3,c:3,label:'Core',color:RC.core },    { r:3,c:4,label:'Corridor',color:RC.corridor }, { r:3,c:5,label:'Core',color:RC.core },
      { r:4,c:3,label:'Lift',color:RC.lift },    { r:4,c:4,label:'Communal',color:RC.communal }, { r:4,c:5,label:'Lift',color:RC.lift },
      // Right arm — single row 3, cols 6-8
      { r:3,c:6,label:'Stair',color:RC.stairs },
      { r:3,c:7,label:'1 Bed',color:RC.bed1 },
      { r:3,c:8,label:'Studio',color:RC.studio },
      // Bottom arm — single col 4, rows 5-6
      { r:5,c:4,label:'Kitchen',color:RC.kitchen },
      { r:6,c:4,label:'Studio',color:RC.studio },
    ]),
  },
};

const CLUSTER_TYPES = Object.keys(CLUSTER_LIBRARY);

const ALGORITHMS = [
  { id: 'diamond',     label: 'Test 1', name: 'Symmetrical Diamond',    endpoint: '/api/cluster/diamond',     color: '#7a8a70' },
  { id: 'eden',        label: 'Test 2', name: 'Organic Eden Growth',     endpoint: '/api/cluster/eden',        color: '#7a7080' },
  { id: 'porous',      label: 'Test 3', name: 'Compact Porous Massing',  endpoint: '/api/cluster/porous',      color: '#8a7860' },
  { id: 'directional', label: 'Test 4', name: 'Directional Aggregation', endpoint: '/api/cluster/directional', color: '#607080' },
];

// ============================================================
// CATALOG CARD
// ============================================================
function ClusterCatalogCard({ type, isActive, onToggle }) {
  const canvasRef = useRef(null);
  const def = CLUSTER_LIBRARY[type];
  const CELL = 10;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !def) return;
    const ctx = canvas.getContext('2d');
    const W = def.gridW * CELL;
    const H = def.gridH * CELL;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#e8e4de';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= def.gridW; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke();
    }
    for (let r = 0; r <= def.gridH; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke();
    }
    for (let r = 0; r < def.gridH; r++) {
      for (let c = 0; c < def.gridW; c++) {
        const cell = def.cells[r][c];
        if (!cell) continue;
        ctx.fillStyle = cell.color;
        ctx.fillRect(c * CELL + 0.5, r * CELL + 0.5, CELL - 1, CELL - 1);
        ctx.strokeStyle = 'rgba(0,0,0,0.20)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(c * CELL + 0.5, r * CELL + 0.5, CELL - 1, CELL - 1);
      }
    }
    if (!isActive) {
      ctx.fillStyle = 'rgba(240,237,232,0.55)';
      ctx.fillRect(0, 0, W, H);
    }
  }, [def, isActive]);

  return (
    <div onClick={onToggle} style={{
      background: isActive ? T.card : T.bg,
      border: `1px solid ${isActive ? def.typeColor.stroke : T.borderLight}`,
      borderRadius: '6px', padding: '12px',
      cursor: 'pointer', opacity: isActive ? 1 : 0.55,
      transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: isActive ? def.typeColor.stroke : T.borderLight, flexShrink: 0 }} />
        <span style={{ fontSize: '14px', fontWeight: '700', color: T.text, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.5px' }}>
          {type.toUpperCase()}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={def.gridW * CELL} height={def.gridH * CELL}
        style={{ display: 'block', borderRadius: '3px', width: '100%', imageRendering: 'pixelated' }}
      />
      <div style={{ fontSize: '12px', color: T.textSub, lineHeight: 1.5 }}>{def.description}</div>
    </div>
  );
}

// ============================================================
// CLUSTER PREVIEW (sidebar thumbnail)
// ============================================================
function ClusterPreview({ type, size = 60 }) {
  const canvasRef = useRef(null);
  const def = CLUSTER_LIBRARY[type];
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !def) return;
    const ctx = canvas.getContext('2d');
    const cs = size / Math.max(def.gridW, def.gridH);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = T.panel;
    ctx.fillRect(0, 0, size, size);
    for (let r = 0; r < def.gridH; r++) {
      for (let c = 0; c < def.gridW; c++) {
        const cell = def.cells[r][c];
        if (!cell) continue;
        ctx.fillStyle = cell.color;
        ctx.fillRect(c * cs + 0.5, r * cs + 0.5, cs - 1, cs - 1);
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(c * cs + 0.5, r * cs + 0.5, cs - 1, cs - 1);
      }
    }
  }, [def, size]);
  return <canvas ref={canvasRef} width={size} height={size} style={{ display: 'block', borderRadius: '3px', flexShrink: 0 }} />;
}

// ============================================================
// MAIN CANVAS
// ============================================================
function ClusterCanvas({ placedClusters, voidCells, gridCols, gridRows, showGrid, hoveredId, selectedId, onHover, onSelect, onDoubleClick, cellSize }) {
  const canvasRef = useRef(null);
  const W = gridCols * cellSize;
  const H = gridRows * cellSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);

    if (showGrid) {
      for (let c = 0; c <= gridCols; c++) {
        ctx.strokeStyle = c % 5 === 0 ? T.gridMajor : T.gridLine;
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(c * cellSize, 0); ctx.lineTo(c * cellSize, H); ctx.stroke();
      }
      for (let r = 0; r <= gridRows; r++) {
        ctx.strokeStyle = r % 5 === 0 ? T.gridMajor : T.gridLine;
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(0, r * cellSize); ctx.lineTo(W, r * cellSize); ctx.stroke();
      }
    }

    if (voidCells?.length) {
      ctx.fillStyle = T.void;
      for (const [vc, vr] of voidCells) ctx.fillRect(vc * cellSize, vr * cellSize, cellSize, cellSize);
    }

    for (const placed of placedClusters) {
      const def = CLUSTER_LIBRARY[placed.type];
      if (!def) continue;
      const isSelected = placed.id === selectedId;
      const isHovered  = placed.id === hoveredId;
      const ox = placed.col * cellSize;
      const oy = placed.row * cellSize;

      for (let r = 0; r < def.gridH; r++) {
        for (let c = 0; c < def.gridW; c++) {
          const cell = def.cells[r][c];
          if (!cell) continue;
          const x = ox + c * cellSize;
          const y = oy + r * cellSize;
          ctx.fillStyle = cell.color;
          ctx.fillRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
          ctx.strokeStyle = isSelected ? T.accent : isHovered ? def.typeColor.stroke : 'rgba(0,0,0,0.18)';
          ctx.lineWidth = isSelected ? 1.5 : isHovered ? 1 : 0.5;
          ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
          if (cellSize >= 18) {
            ctx.fillStyle = 'rgba(0,0,0,0.50)';
            ctx.font = `500 ${Math.max(6, cellSize * 0.28)}px 'Barlow', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cell.label, x + cellSize / 2, y + cellSize / 2);
          }
        }
      }

      if (cellSize >= 10) {
        const lcx = ox + (def.gridW / 2) * cellSize;
        const lcy = oy + (def.gridH / 2) * cellSize;
        ctx.save();
        ctx.fillStyle = def.typeColor.text;
        ctx.font = `700 ${Math.max(9, cellSize * 0.75)}px 'Barlow Condensed', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255,255,255,0.85)';
        ctx.shadowBlur = 5;
        ctx.fillText(placed.type.toUpperCase(), lcx, lcy);
        ctx.restore();
      }

      if (isSelected) {
        ctx.strokeStyle = T.accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(ox - 2, oy - 2, def.gridW * cellSize + 4, def.gridH * cellSize + 4);
        ctx.setLineDash([]);
      }
    }
  }, [placedClusters, voidCells, gridCols, gridRows, showGrid, hoveredId, selectedId, cellSize, W, H]);

  const getHit = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top)  * (H / rect.height);
    const gc = Math.floor(mx / cellSize);
    const gr = Math.floor(my / cellSize);
    return placedClusters.find(p => {
      const def = CLUSTER_LIBRARY[p.type];
      if (!def) return false;
      if (gc < p.col || gc >= p.col + def.gridW) return false;
      if (gr < p.row || gr >= p.row + def.gridH) return false;
      return def.cells[gr - p.row]?.[gc - p.col] !== null;
    });
  }, [placedClusters, W, H, cellSize]);

  return (
    <canvas
      ref={canvasRef} width={W} height={H}
      onMouseMove={e => onHover(getHit(e)?.id || null)}
      onMouseLeave={() => onHover(null)}
      onClick={e => onSelect(getHit(e)?.id || null)}
      onDoubleClick={e => { const hit = getHit(e); if (hit) onDoubleClick(hit); }}
      style={{ display: 'block', cursor: hoveredId ? 'pointer' : 'crosshair' }}
    />
  );
}

// ============================================================
// CLUSTER DETAIL
// ============================================================
function ClusterDetail({ cluster }) {
  if (!cluster) return (
    <div style={{ color: T.textTiny, fontSize: '13px', textAlign: 'center', padding: '28px 0', lineHeight: 1.8 }}>
      Click a cluster<br />to inspect rooms
    </div>
  );
  const def = CLUSTER_LIBRARY[cluster.type];
  const rooms = {};
  if (def) for (const row of def.cells) for (const cell of row) {
    if (cell) rooms[cell.label] = (rooms[cell.label] || 0) + 1;
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: def?.typeColor.stroke }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>{cluster.type}</span>
      </div>
      <div style={{ fontSize: '12px', color: T.textSub, marginBottom: '16px', lineHeight: 1.6 }}>{def?.description}</div>
      <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: T.textTiny, marginBottom: '10px' }}>Room breakdown</div>
      {Object.entries(rooms).map(([label, count]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: T.panel, borderRadius: '3px', marginBottom: '3px', fontSize: '13px' }}>
          <span style={{ color: T.textSub }}>{label}</span>
          <span style={{ fontWeight: '700', color: T.text }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// LEGEND
// ============================================================
function Legend() {
  const items = [
    { label: 'Core / Stair',     color: RC.core },
    { label: 'Corridor',         color: RC.corridor },
    { label: 'Lift',             color: RC.lift },
    { label: 'Communal',         color: RC.communal },
    { label: 'Studio',           color: RC.studio },
    { label: '1–2 Bed',          color: RC.bed2 },
    { label: '3–4 Bed',          color: RC.bed3 },
    { label: 'Kitchen / Living', color: RC.kitchen },
    { label: 'Work / Library',   color: RC.library },
    { label: 'Gym / Play / Garden', color: RC.garden },
  ];
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: T.textTiny, marginBottom: '12px' }}>Legend</div>
      {items.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '7px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: item.color, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
          <span style={{ fontSize: '12px', color: T.textSub }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

const SL = (text) => (
  <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: T.textTiny, marginBottom: '12px' }}>{text}</div>
);

// ============================================================
// MAIN APP
// ============================================================
export default function ClusterApp() {
  const GRID_COLS = 100;
  const GRID_ROWS = 80;

  const [activeAlgo, setActiveAlgo]         = useState('diamond');
  const [placedClusters, setPlacedClusters] = useState([]);
  const [voidCells, setVoidCells]           = useState([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState(null);
  const [showGrid, setShowGrid]             = useState(true);
  const [hoveredId, setHoveredId]           = useState(null);
  const [selectedId, setSelectedId]         = useState(null);
  const [numClusters, setNumClusters]       = useState(12);
  const [randomSeed, setRandomSeed]         = useState(42);
  const [voidDensity, setVoidDensity]       = useState(0.12);
  const [anchorCol, setAnchorCol]           = useState(2);
  const [anchorRow, setAnchorRow]           = useState(2);
  const [cellSize, setCellSize]             = useState(14);
  const [activeTypes, setActiveTypes]       = useState(new Set(CLUSTER_TYPES));
  const [showCatalog, setShowCatalog]       = useState(false);
  const [zoomedClusterId, setZoomedClusterId] = useState(null); // double-click zoom

  const canvasWrapperRef = useRef(null);
  const prevCellSizeRef  = useRef(14); // remembers zoom before double-click

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      setCellSize(prev => Math.min(28, Math.max(6, prev + (e.deltaY < 0 ? 1 : -1))));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // ESC to zoom back out from a double-clicked cluster
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && zoomedClusterId) {
        setCellSize(prevCellSizeRef.current);
        setZoomedClusterId(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [zoomedClusterId]);

  // Double-click: zoom in and scroll to centre the cluster, or zoom back out
  const handleDoubleClickCluster = useCallback((cluster) => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;
    const def = CLUSTER_LIBRARY[cluster.type];
    if (!def) return;

    if (zoomedClusterId === cluster.id) {
      // Already zoomed into this cluster — zoom back out
      setCellSize(prevCellSizeRef.current);
      setZoomedClusterId(null);
      return;
    }

    // Remember current zoom, then snap to max
    prevCellSizeRef.current = cellSize;
    const ZOOM_TARGET = 28;
    setCellSize(ZOOM_TARGET);
    setSelectedId(cluster.id);
    setZoomedClusterId(cluster.id);

    // After React re-renders at new cellSize, scroll so the cluster is centred
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const clusterPixelX = cluster.col * ZOOM_TARGET + (def.gridW * ZOOM_TARGET) / 2;
        const clusterPixelY = cluster.row * ZOOM_TARGET + (def.gridH * ZOOM_TARGET) / 2;
        wrapper.scrollLeft = clusterPixelX - wrapper.clientWidth  / 2;
        wrapper.scrollTop  = clusterPixelY - wrapper.clientHeight / 2;
      });
    });
  }, [zoomedClusterId, cellSize]);

  const selectedCluster = useMemo(() => placedClusters.find(c => c.id === selectedId), [placedClusters, selectedId]);
  const currentAlgo = ALGORITHMS.find(a => a.id === activeAlgo);

  const toggleType = (type) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) { if (next.size > 1) next.delete(type); }
      else next.add(type);
      return next;
    });
  };

  const runAlgorithm = useCallback(async (algoId, types) => {
    setLoading(true);
    setError(null);
    setSelectedId(null);
    const algo = ALGORITHMS.find(a => a.id === algoId);
    if (!algo) { setLoading(false); return; }
    try {
      const res = await fetch(`${API}${algo.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grid_cols: GRID_COLS, grid_rows: GRID_ROWS, cell_size: cellSize,
          num_clusters: numClusters, random_seed: randomSeed,
          void_density: voidDensity, seed_col: anchorCol, seed_row: anchorRow,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        const typeArr = [...(types || activeTypes)];
        const mapped = data.clusters.map((c, i) => ({
          id: c.id, col: c.col, row: c.row,
          type: typeArr[i % typeArr.length],
        }));
        setPlacedClusters(mapped);
        setVoidCells(data.void_cells || []);
      } else {
        setError('Algorithm error.');
      }
    } catch {
      setError('Backend unreachable — start the Python server on :8000');
    }
    setLoading(false);
  }, [numClusters, randomSeed, voidDensity, anchorCol, anchorRow, activeTypes, cellSize]);

  useEffect(() => { runAlgorithm('diamond', new Set(CLUSTER_TYPES)); }, []);

  const stats = useMemo(() => {
    const c = {};
    CLUSTER_TYPES.forEach(t => { c[t] = 0; });
    placedClusters.forEach(p => { c[p.type] = (c[p.type] || 0) + 1; });
    return c;
  }, [placedClusters]);

  return (
    <div style={{ fontFamily: "'Barlow', sans-serif", background: T.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column', color: T.text }}>

      {/* ── HEADER: branding + algo tabs + view controls ── */}
      <div style={{
        background: T.card, borderBottom: `1px solid ${T.border}`,
        padding: '0 24px', display: 'flex', alignItems: 'center',
        gap: '20px', height: '58px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexShrink: 0 }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: '700', fontSize: '22px', letterSpacing: '2px' }}>LinX</span>
          <span style={{ fontSize: '12px', fontWeight: '600', color: T.accent, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Cluster Multiplication</span>
        </div>
        <div style={{ width: '1px', height: '28px', background: T.border, flexShrink: 0 }} />

        <div style={{ display: 'flex', gap: '6px' }}>
          {ALGORITHMS.map(algo => (
            <button key={algo.id} onClick={() => { setActiveAlgo(algo.id); runAlgorithm(algo.id); }} style={{
              padding: '8px 16px',
              background: activeAlgo === algo.id ? algo.color : 'transparent',
              color: activeAlgo === algo.id ? '#fff' : T.textSub,
              border: `1px solid ${activeAlgo === algo.id ? algo.color : T.border}`,
              borderRadius: '4px', cursor: 'pointer',
              fontSize: '13px', fontWeight: '600',
              fontFamily: "'Barlow', sans-serif", transition: 'all 0.15s',
            }}>
              {algo.label} · {algo.name}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={() => setShowCatalog(v => !v)} style={{
            padding: '8px 14px',
            background: showCatalog ? T.accentSoft : 'transparent',
            color: showCatalog ? T.accent : T.textSub,
            border: `1px solid ${showCatalog ? T.accent : T.border}`,
            borderRadius: '4px', cursor: 'pointer',
            fontSize: '13px', fontWeight: '600', fontFamily: "'Barlow', sans-serif",
          }}>
            {showCatalog ? 'Hide Catalog' : 'Cluster Catalog'}
          </button>

          <button onClick={() => setShowGrid(v => !v)} style={{
            padding: '8px 14px', background: 'transparent',
            color: showGrid ? T.textSub : T.textTiny,
            border: `1px solid ${T.border}`, borderRadius: '4px',
            cursor: 'pointer', fontSize: '13px', fontFamily: "'Barlow', sans-serif",
          }}>Grid {showGrid ? 'ON' : 'OFF'}</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: T.textSub }}>Zoom</span>
            <input type="range" min={6} max={28} value={cellSize} onChange={e => setCellSize(+e.target.value)}
              style={{ width: '80px', accentColor: T.accent }} />
            <span style={{ fontSize: '13px', color: T.text, fontWeight: '600', minWidth: '32px' }}>{cellSize}px</span>
            <span style={{ fontSize: '11px', color: T.textTiny }}>(or scroll)</span>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR: clusters + seed + extras + generate ── */}
      <div style={{
        background: T.panel, borderBottom: `1px solid ${T.border}`,
        padding: '12px 24px', display: 'flex', alignItems: 'center',
        gap: '24px', flexShrink: 0, flexWrap: 'wrap',
      }}>

        {/* Cluster count slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: T.textSub, whiteSpace: 'nowrap' }}>
            Clusters: <strong style={{ color: T.text, fontSize: '14px' }}>{numClusters}</strong>
          </label>
          <input
            type="range" min={4} max={48} value={numClusters}
            onChange={e => setNumClusters(+e.target.value)}
            style={{ width: '140px', accentColor: T.accent }}
          />
          <div style={{ display: 'flex', gap: '4px' }}>
            {[...activeTypes].map((type, i) => {
              const def = CLUSTER_LIBRARY[type];
              const count = Math.floor(numClusters / activeTypes.size) + (i < numClusters % activeTypes.size ? 1 : 0);
              return (
                <div key={type} style={{
                  fontSize: '11px', padding: '3px 8px',
                  background: def.typeColor.fill,
                  border: `1px solid ${def.typeColor.stroke}`,
                  borderRadius: '3px', color: def.typeColor.text, fontWeight: '600',
                  fontFamily: "'Barlow', sans-serif",
                }}>
                  {type.slice(0, 2).toUpperCase()} ×{count}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ width: '1px', height: '28px', background: T.border }} />

        {/* Random seed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: T.textSub, whiteSpace: 'nowrap' }}>Random Seed</label>
          <input
            type="number" value={randomSeed} onChange={e => setRandomSeed(+e.target.value)}
            style={{ width: '80px', padding: '6px 10px', background: T.card, border: `1px solid ${T.border}`, borderRadius: '4px', fontSize: '13px', color: T.text, fontFamily: "'Barlow', sans-serif" }}
          />
          <button
            onClick={() => { const s = Math.floor(Math.random() * 9999); setRandomSeed(s); setTimeout(() => runAlgorithm(activeAlgo), 50); }}
            style={{ padding: '6px 11px', background: T.card, border: `1px solid ${T.border}`, borderRadius: '4px', cursor: 'pointer', fontSize: '16px', color: T.textSub }}
          >⟳</button>
        </div>

        {/* Void density — eden / porous only */}
        {(activeAlgo === 'eden' || activeAlgo === 'porous') && (
          <>
            <div style={{ width: '1px', height: '28px', background: T.border }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: T.textSub, whiteSpace: 'nowrap' }}>
                Void: <strong style={{ color: T.text }}>{(voidDensity * 100).toFixed(0)}%</strong>
              </label>
              <input
                type="range" min={0} max={0.35} step={0.01} value={voidDensity}
                onChange={e => setVoidDensity(+e.target.value)}
                style={{ width: '100px', accentColor: T.accent }}
              />
            </div>
          </>
        )}

        {/* Anchor — directional only */}
        {activeAlgo === 'directional' && (
          <>
            <div style={{ width: '1px', height: '28px', background: T.border }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: T.textSub, whiteSpace: 'nowrap' }}>Anchor (col × row)</label>
              <input type="number" min={1} max={20} value={anchorCol} onChange={e => setAnchorCol(+e.target.value)}
                style={{ width: '54px', padding: '6px 8px', background: T.card, border: `1px solid ${T.border}`, borderRadius: '4px', fontSize: '13px', color: T.text, fontFamily: "'Barlow', sans-serif" }} />
              <span style={{ fontSize: '13px', color: T.textTiny }}>×</span>
              <input type="number" min={1} max={20} value={anchorRow} onChange={e => setAnchorRow(+e.target.value)}
                style={{ width: '54px', padding: '6px 8px', background: T.card, border: `1px solid ${T.border}`, borderRadius: '4px', fontSize: '13px', color: T.text, fontFamily: "'Barlow', sans-serif" }} />
            </div>
          </>
        )}

        {/* Generate — pushed to the right */}
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => runAlgorithm(activeAlgo)} disabled={loading}
            style={{
              padding: '10px 32px',
              background: loading ? T.border : T.accent,
              color: loading ? T.textSub : '#fff',
              border: 'none', borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '13px', fontWeight: '700',
              fontFamily: "'Barlow', sans-serif", letterSpacing: '0.5px',
            }}
          >
            {loading ? 'Generating…' : 'Generate Layout'}
          </button>
        </div>
      </div>

      {/* ── CATALOG (optional) ── */}
      {showCatalog && (
        <div style={{ background: T.card, borderBottom: `1px solid ${T.border}`, padding: '18px 24px', flexShrink: 0 }}>
          <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: T.textTiny }}>Cluster Catalog</div>
            <span style={{ fontSize: '12px', color: T.textSub }}>Click to toggle types in the layout</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {CLUSTER_TYPES.map(type => (
              <ClusterCatalogCard key={type} type={type} isActive={activeTypes.has(type)} onToggle={() => toggleType(type)} />
            ))}
          </div>
        </div>
      )}

      {/* ── BODY ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT SIDEBAR */}
        <div style={{
          width: '264px', flexShrink: 0, background: T.panel,
          borderRight: `1px solid ${T.border}`, padding: '20px 18px',
          overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px',
        }}>
          {SL('Cluster Library')}
          <p style={{ fontSize: '12px', color: T.textSub, margin: '-10px 0 4px', lineHeight: 1.6 }}>
            Toggle which types appear in the layout. Click to activate/deactivate.
          </p>
          {CLUSTER_TYPES.map(type => {
            const def = CLUSTER_LIBRARY[type];
            const isActive = activeTypes.has(type);
            return (
              <div key={type} onClick={() => toggleType(type)} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px', background: isActive ? T.card : 'transparent',
                border: `1px solid ${isActive ? def.typeColor.stroke : T.borderLight}`,
                borderRadius: '5px', cursor: 'pointer',
                opacity: isActive ? 1 : 0.45, transition: 'all 0.15s',
              }}>
                <ClusterPreview type={type} size={56} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: T.text, marginBottom: '4px' }}>{type}</div>
                  <div style={{ fontSize: '11px', color: T.textSub, lineHeight: 1.5 }}>{def.description}</div>
                </div>
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: isActive ? def.typeColor.stroke : T.borderLight, flexShrink: 0 }} />
              </div>
            );
          })}
        </div>

        {/* CANVAS */}
        <div ref={canvasWrapperRef} style={{ flex: 1, overflow: 'auto', position: 'relative', background: T.bg, cursor: 'crosshair' }}>
          {error && (
            <div style={{
              position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)',
              background: '#fff0f0', border: `1px solid ${T.accent}`,
              borderRadius: '6px', padding: '10px 18px', fontSize: '13px', color: T.accent,
              zIndex: 20, whiteSpace: 'nowrap',
            }}>{error}</div>
          )}
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(240,237,232,0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 10, fontSize: '14px', fontWeight: '600', color: T.textSub, letterSpacing: '2px',
            }}>GENERATING…</div>
          )}
          <ClusterCanvas
            placedClusters={placedClusters} voidCells={voidCells}
            gridCols={GRID_COLS} gridRows={GRID_ROWS}
            showGrid={showGrid} hoveredId={hoveredId} selectedId={selectedId}
            onHover={setHoveredId} onSelect={setSelectedId}
            onDoubleClick={handleDoubleClickCluster}
            cellSize={cellSize}
          />
          {/* Zoom-out hint when a cluster is zoomed in */}
          {zoomedClusterId && (
            <div
              onClick={() => { setCellSize(prevCellSizeRef.current); setZoomedClusterId(null); }}
              style={{
                position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
                background: T.accent, color: '#fff',
                padding: '7px 18px', borderRadius: '20px',
                fontSize: '12px', fontWeight: '600', fontFamily: "'Barlow', sans-serif",
                cursor: 'pointer', zIndex: 20, letterSpacing: '0.3px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
                userSelect: 'none',
              }}
            >
              Double-click again or press ESC to zoom out
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{
          width: '224px', flexShrink: 0, background: T.panel,
          borderLeft: `1px solid ${T.border}`, padding: '20px 18px',
          display: 'flex', flexDirection: 'column', gap: '18px', overflowY: 'auto',
        }}>
          {SL('Inspector')}
          <ClusterDetail cluster={selectedCluster} />

          {placedClusters.length > 0 && (
            <>
              <div style={{ height: '1px', background: T.border }} />
              {SL('Distribution')}
              {CLUSTER_TYPES.map(type => {
                const count = stats[type] || 0;
                if (!count) return null;
                const def = CLUSTER_LIBRARY[type];
                const pct = Math.round((count / placedClusters.length) * 100);
                return (
                  <div key={type} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>{type}</span>
                      <span style={{ fontSize: '12px', color: T.textSub }}>{count} · {pct}%</span>
                    </div>
                    <div style={{ height: '5px', background: T.borderLight, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: def.typeColor.stroke, borderRadius: '3px', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ height: '1px', background: T.border }} />
              {SL('Totals')}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: T.textSub }}>Clusters</span>
                <span style={{ fontWeight: '700', color: T.text }}>{placedClusters.length}</span>
              </div>
            </>
          )}

          <div style={{ height: '1px', background: T.border }} />
          <Legend />
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        background: T.card, borderTop: `1px solid ${T.border}`,
        padding: '8px 24px', display: 'flex', alignItems: 'center',
        gap: '16px', fontSize: '12px', color: T.textTiny, flexShrink: 0,
      }}>
        <span style={{ fontWeight: '600', color: T.textSub }}>{currentAlgo?.name}</span>
        <span>·</span>
        <span>{placedClusters.length} clusters · grid {GRID_COLS}×{GRID_ROWS} · {cellSize}px/cell</span>
        {hoveredId && <><span>·</span><span style={{ color: T.accent }}>hover: {hoveredId}</span></>}
      </div>
    </div>
  );
}