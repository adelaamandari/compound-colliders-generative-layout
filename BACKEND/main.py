import math
import random
import json
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any, Set, Tuple

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# MODELS
# ============================================================

class Room(BaseModel):
    id: str
    category: str
    x: float
    y: float
    width: float
    height: float
    bgColor: str
    borderColor: str
    floor: int
    pinned: bool = False
    rotation: int = 0
    flipX: bool = False
    shapeVariant: int = 0
    shapePath: Optional[str] = "0,0 100,0 100,100 0,100"

    area: Optional[float] = None
    score: Optional[float] = None
    optName: Optional[str] = None

    floor_height: Optional[float] = None
    struct_type: Optional[str] = None
    is_double_height: Optional[bool] = False  
    daylight_score: Optional[float] = None

    model_config = ConfigDict(extra="allow")


class BoundaryConfig(BaseModel):
    type: str = "Rectangle"
    minX: Optional[float] = 30
    maxX: Optional[float] = 770
    minY: Optional[float] = 70
    maxY: Optional[float] = 570
    coordinates: Optional[List[List[float]]] = None
    name: str = "Default Site"
    gridSize: Optional[float] = 20
    unit: str = "pixels"
    metadata: Optional[dict] = None


class LayoutRequest(BaseModel):
    targetUser: str
    activeFloor: int
    rooms: List[Room]
    randomize: bool = False
    boundary: Optional[BoundaryConfig] = None


# ============================================================
# PROGRAMME LOOKUP TABLES
# ============================================================

FLOOR_TO_FLOOR_HEIGHT = 3.0

PROGRAMME_FLOOR_HEIGHT = {
    "Lobby":              6.0,
    "Library":            6.0,
    "Mini Cinema":        6.0,
    "Garden":             6.0,
    "Multipurpose Hall":  6.0,
    "Gym":                4.5,
    "Events Room":        4.5,
    "Indoor Play Area":   4.5,
    "Core":               3.0,
    "Stairs":             3.0,
    "Corridor":           3.0,
    "Outdoor Playground": 3.0,
    "Shared Living Room": 3.0,
    "Shared Kitchen":     3.0,
    "Game Room":          3.0,
    "Workspace Room":     3.0,
    "Meeting Room":       3.0,
    "Concentration Pod":  3.0,
    "Studio":             3.0,
    "1 Bedroom":          3.0,
    "2 Bedroom":          3.0,
    "3 Bedroom":          6.0,
    "4 Bedroom":          6.0,
}
DEFAULT_FLOOR_HEIGHT = 3.0

def get_floor_height(category_str: str) -> float:
    name = category_str.split(" - ")[-1]
    return PROGRAMME_FLOOR_HEIGHT.get(name, DEFAULT_FLOOR_HEIGHT)

PROGRAMME_STRUCT_TYPE = {
    "Core":               "C4",
    "Lobby":              "C4",
    "Stairs":             "C4",
    "Corridor":           "C2A",
    "Multipurpose Hall":  "C4",
    "Mini Cinema":        "C3",
    "Gym":                "C4",
    "Events Room":        "C3",
    "Indoor Play Area":   "C3",
    "Garden":             "C2B",
    "Outdoor Playground": "C2B",
    "Shared Living Room": "C3",
    "Shared Kitchen":     "C2B",
    "Game Room":          "C2A",
    "Library":            "C2A",
    "Workspace Room":     "C2A",
    "Meeting Room":       "C2A",
    "Concentration Pod":  "C1",
    "Studio":             "C1",
    "1 Bedroom":          "C1",
    "2 Bedroom":          "C1",
    "3 Bedroom":          "C2A",
    "4 Bedroom":          "C2A",
}
DEFAULT_STRUCT_TYPE = "C1"


def get_struct_type(category_str: str) -> str:
    name = category_str.split(" - ")[-1]
    return PROGRAMME_STRUCT_TYPE.get(name, DEFAULT_STRUCT_TYPE)


# ============================================================
# ADJACENCY MATRIX
# ============================================================

states = [
    "SK", "SL", "GR", "W", "L", "CP", "MR", "LB",
    "MH", "MC", "GYM", "ER", "IP", "G", "OP",
    "S1", "S2", "S3", "S4", "S5",
    "Corridor", "Core", "Entrance", "Stairs"
]
adjacency_matrix = {a: {b: 1.0 for b in states} for a in states}

def set_weight(a, b, w):
    if a in adjacency_matrix and b in adjacency_matrix:
        adjacency_matrix[a][b] = w
        adjacency_matrix[b][a] = w

set_weight("Corridor", "Core", 10.0)
set_weight("Stairs", "Core", 10.0)
set_weight("Stairs", "Corridor", 5.0)

set_weight("LB", "Core", 15.0)
set_weight("LB", "Corridor", 5.0)

for res in ["S1", "S2", "S3", "S4", "S5"]:
    set_weight(res, "Corridor", 5.0)

for pc in ["SK", "SL", "GR", "W", "L", "CP", "MR"]:
    set_weight(pc, "Corridor", 4.0)

for pb in ["MH", "MC", "GYM", "ER", "IP", "G", "OP"]:
    set_weight(pb, "Corridor", 2.0)
    set_weight(pb, "Core", 2.0)
    for res in ["S1", "S2", "S3", "S4", "S5"]:
        set_weight(pb, res, 2.0)

set_weight("S1", "SK", 3.0); set_weight("S1", "SL", 3.0)
set_weight("S2", "W", 3.0);  set_weight("S2", "CP", 3.0)
set_weight("S3", "IP", 3.0); set_weight("S4", "G", 3.0); set_weight("S5", "OP", 3.0)
set_weight("L", "GR", 0.0);  set_weight("L", "SL", 0.0)

def get_shortcode(category_str):
    name = category_str.split(" - ")[-1]
    mapping = {
        "Shared Kitchen": "SK", "Shared Living Room": "SL", "Game Room": "GR",
        "Workspace Room": "W", "Library": "L", "Concentration Pod": "CP", "Meeting Room": "MR",
        "Multipurpose Hall": "MH", "Mini Cinema": "MC", "Gym": "GYM", "Events Room": "ER",
        "Indoor Play Area": "IP", "Garden": "G", "Outdoor Playground": "OP", "Lobby": "LB",
        "Studio": "S1", "1 Bedroom": "S2", "2 Bedroom": "S3", "3 Bedroom": "S4", "4 Bedroom": "S5",
        "Core": "Core", "Stairs": "Stairs", "Corridor": "Corridor"
    }
    return mapping.get(name, "S1")


# ============================================================
# GEOMETRY HELPERS
# ============================================================

def point_in_polygon(x, y, poly):
    inside = False
    n = len(poly)
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if ((p1y > y) != (p2y > y)) and (x < (p2x - p1x) * (y - p1y) / (p2y - p1y) + p1x):
            inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def is_within_bounds(x, y, w, h, poly, mx, Mx, my, My):
    if poly:
        pts = [(x, y), (x+w, y), (x, y+h), (x+w, y+h), (x+w/2, y+h/2)]
        return all(point_in_polygon(px, py, poly) for px, py in pts)
    return x >= mx and y >= my and x + w <= Mx and y + h <= My

def is_overlap(x, y, w, h, floor, occupancy):
    for ox, oy, ow, oh in occupancy.get(floor, []):
        if not (x + w <= ox or ox + ow <= x or y + h <= oy or oy + oh <= y):
            return True
    return False

# ============================================================
# LAYOUT ENGINE
# ============================================================

@app.post("/api/straighten-walls")
def auto_layout(request: LayoutRequest):
    rooms = request.rooms
    boundary = request.boundary
    snap_grid = 20  
    randomize = request.randomize

    poly_pixels = boundary.metadata.get("polygon_pixels") if boundary and boundary.metadata else None
    min_x = int(boundary.minX) if boundary and boundary.minX is not None else 30
    max_x = int(boundary.maxX) if boundary and boundary.maxX is not None else 770
    min_y = int(boundary.minY) if boundary and boundary.minY is not None else 70
    max_y = int(boundary.maxY) if boundary and boundary.maxY is not None else 570

    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2

    placed_rooms = []
    # Expanded floor tracking to handle multi-floor projections
    occupancy = {f: [] for f in range(1, 20)}

    for r in rooms:
        r.floor_height = get_floor_height(r.category)
        r.struct_type = get_struct_type(r.category)
        r.is_double_height = r.floor_height > FLOOR_TO_FLOOR_HEIGHT

    unpinned_rooms = []
    for r in rooms:
        if r.id.startswith("AutoCorridor"):
            continue
        if r.pinned:
            # PROJECT VOIDS UPWARDS: Calculate how many floors this room spans
            num_floors = int(max(1, round(r.floor_height / FLOOR_TO_FLOOR_HEIGHT)))
            for f in range(r.floor, r.floor + num_floors):
                occupancy[f].append((r.x, r.y, r.width, r.height))
            placed_rooms.append(r)
        else:
            unpinned_rooms.append(r)

    rooms_by_floor = {}
    for r in unpinned_rooms:
        rooms_by_floor.setdefault(r.floor, []).append(r)

    for floor_num in sorted(rooms_by_floor.keys()):
        floor_rooms = rooms_by_floor[floor_num]

        cores      = [r for r in floor_rooms if "Core" in r.category]
        corridors  = [r for r in floor_rooms if "Corridor" in r.category]
        communals  = [r for r in floor_rooms if "Communal" in r.category or "Buffer" in r.category]
        residential = [r for r in floor_rooms if r not in cores and r not in corridors and r not in communals]

        for core in cores:
            floor_occ = occupancy.get(floor_num, [])
            if not floor_occ:
                cx, cy = center_x, center_y
            else:
                best_dist = -1
                best_pos = (center_x, center_y)
                for x in range(min_x, max_x, snap_grid * 2):
                    for y in range(min_y, max_y, snap_grid * 2):
                        if is_within_bounds(x, y, core.width, core.height, poly_pixels, min_x, max_x, min_y, max_y):
                            if not is_overlap(x, y, core.width, core.height, floor_num, occupancy):
                                min_dist = min(
                                    math.sqrt((x - (ox + ow/2))**2 + (y - (oy + oh/2))**2)
                                    for ox, oy, ow, oh in floor_occ
                                )
                                if min_dist > best_dist:
                                    best_dist = min_dist
                                    best_pos = (x, y)
                cx, cy = best_pos

            cx = (int(cx - core.width / 2) // snap_grid) * snap_grid
            cy = (int(cy - core.height / 2) // snap_grid) * snap_grid

            if not is_within_bounds(cx, cy, core.width, core.height, poly_pixels, min_x, max_x, min_y, max_y):
                cx, cy = min_x + snap_grid, min_y + snap_grid

            core.x, core.y, core.pinned = cx, cy, True
            
            # PROJECT VOIDS UPWARDS
            num_floors = int(max(1, round(core.floor_height / FLOOR_TO_FLOOR_HEIGHT)))
            for f in range(core.floor, core.floor + num_floors):
                occupancy[f].append((cx, cy, core.width, core.height))
            placed_rooms.append(core)

        pack_order = corridors + communals + residential
        if randomize:
            random.shuffle(corridors)
            random.shuffle(communals)
            random.shuffle(residential)
            pack_order = corridors + communals + residential
        else:
            pack_order.sort(key=lambda r: (0 if "Corridor" in r.category else 1, -(r.width * r.height)))

        for room in pack_order:
            room_code = get_shortcode(room.category)
            best_score = -float('inf')
            best_pos = None

            candidates: set = set()
            floor_placed = [r for r in placed_rooms if r.floor == floor_num]
            floor_cores  = [r for r in floor_placed if "Core" in r.category]

            for p in floor_placed:
                px, py, pw, ph = p.x, p.y, p.width, p.height
                rw, rh = room.width, room.height
                for x in range(int(px - rw + snap_grid), int(px + pw), snap_grid):
                    candidates.add((x, py - rh))
                    candidates.add((x, py + ph))
                for y in range(int(py - rh + snap_grid), int(py + ph), snap_grid):
                    candidates.add((px - rw, y))
                    candidates.add((px + pw, y))

            if not candidates:
                for x in range(min_x, max_x, snap_grid * 4):
                    for y in range(min_y, max_y, snap_grid * 4):
                        candidates.add((x, y))

            cand_list = list(candidates)
            if randomize:
                random.shuffle(cand_list)

            for cx, cy in cand_list:
                cx = (int(cx) // snap_grid) * snap_grid
                cy = (int(cy) // snap_grid) * snap_grid

                if not is_within_bounds(cx, cy, room.width, room.height, poly_pixels, min_x, max_x, min_y, max_y):
                    continue
                # Overlap check now correctly sees upper-floor voids projected from below
                if is_overlap(cx, cy, room.width, room.height, floor_num, occupancy):
                    continue

                score = 0.0
                if floor_cores:
                    dist_to_core = min(
                        math.sqrt((cx + room.width/2 - (fc.x + fc.width/2))**2 +
                                  (cy + room.height/2 - (fc.y + fc.height/2))**2)
                        for fc in floor_cores
                    )
                    score -= dist_to_core / 100.0
                else:
                    score -= math.sqrt((cx + room.width/2 - center_x)**2 +
                                       (cy + room.height/2 - center_y)**2) / 100.0

                for p in floor_placed:
                    p_code = get_shortcode(p.category)
                    weight = adjacency_matrix.get(room_code, {}).get(p_code, 1.0)
                    dx = max(0, cx - (p.x + p.width), p.x - (cx + room.width))
                    dy = max(0, cy - (p.y + p.height), p.y - (cy + room.height))
                    if dx == 0 and dy == 0:
                        score += weight * 15
                    elif dx < 40 and dy < 40:
                        score += weight * 3

                    neighbour_struct = get_struct_type(p.category)
                    room_struct      = get_struct_type(room.category)
                    struct_adjacency = {
                        ("C1", "C2A"), ("C2A", "C1"),
                        ("C2A", "C2B"), ("C2B", "C2A"),
                        ("C2B", "C3"), ("C3", "C2B"),
                        ("C3", "C4"), ("C4", "C3"),
                    }
                    if (room_struct, neighbour_struct) in struct_adjacency and (dx == 0 or dy == 0):
                        score += 5.0 

                if score > best_score:
                    best_score = score
                    best_pos = (cx, cy)

            if not best_pos:
                for x in range(min_x, max_x, snap_grid):
                    for y in range(min_y, max_y, snap_grid):
                        if (is_within_bounds(x, y, room.width, room.height, poly_pixels, min_x, max_x, min_y, max_y)
                                and not is_overlap(x, y, room.width, room.height, floor_num, occupancy)):
                            best_pos = (x, y)
                            break
                    if best_pos:
                        break

            if best_pos:
                room.x, room.y = best_pos
                
                # PROJECT VOIDS UPWARDS
                num_floors = int(max(1, round(room.floor_height / FLOOR_TO_FLOOR_HEIGHT)))
                for f in range(room.floor, room.floor + num_floors):
                    occupancy[f].append((room.x, room.y, room.width, room.height))
                
                placed_rooms.append(room)

    # 3. Daylight Scoring Heuristic
    for room in placed_rooms:
        if "Residential" in room.category:
            total_perim = 2 * (room.width + room.height)
            blocked_perim = 0
            
            for p in placed_rooms:
                if p.id == room.id or p.floor != room.floor:
                    continue
                
                dx = max(0, min(room.x + room.width, p.x + p.width) - max(room.x, p.x))
                dy = max(0, min(room.y + room.height, p.y + p.height) - max(room.y, p.y))
                
                if dy > 0 and (abs(room.x - (p.x + p.width)) < 1 or abs((room.x + room.width) - p.x) < 1):
                    blocked_perim += dy
                if dx > 0 and (abs(room.y - (p.y + p.height)) < 1 or abs((room.y + room.height) - p.y) < 1):
                    blocked_perim += dx
            
            exposed = max(0, total_perim - blocked_perim)
            room.daylight_score = round(exposed / total_perim, 2)
        else:
            room.daylight_score = None

    active_rules = []
    for room_a in placed_rooms:
        code_a = get_shortcode(room_a.category)
        closest_targets = {}
        for room_b in placed_rooms:
            if room_a.id == room_b.id or room_a.floor != room_b.floor:
                continue
            code_b = get_shortcode(room_b.category)
            w = adjacency_matrix.get(code_a, {}).get(code_b, 1.0)
            if w >= 2.0 or w == 0.0:
                dx = max(0, room_a.x - (room_b.x + room_b.width), room_b.x - (room_a.x + room_a.width))
                dy = max(0, room_a.y - (room_b.y + room_b.height), room_b.y - (room_a.y + room_a.height))
                dist = math.sqrt(dx*dx + dy*dy)
                if code_b not in closest_targets or dist < closest_targets[code_b]['dist']:
                    closest_targets[code_b] = {'id': room_b.id, 'weight': w, 'dist': dist}
        for target in closest_targets.values():
            rule_id = tuple(sorted([room_a.id, target['id']]))
            active_rules.append({
                "rule_id": f"{rule_id[0]}_{rule_id[1]}",
                "source": room_a.id,
                "target": target['id'],
                "weight": target['weight'],
                "floor": room_a.floor
            })

    unique_rules = list({r["rule_id"]: r for r in active_rules}.values())
    return {"status": "success", "rooms": placed_rooms, "rules": unique_rules}


# ============================================================
# BOUNDARY PARSING
# ============================================================

@app.post("/api/parse-void-boundary")
async def parse_void_boundary(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        void_json = json.loads(contents)
        poly_m = void_json.get("boundary", {}).get("local_polygon_m", [])
        if not poly_m:
            return {"status": "error", "message": "No local_polygon_m found"}

        PIXELS_PER_METER = 20
        raw_pixels = [(p["x"] * PIXELS_PER_METER, -p["y"] * PIXELS_PER_METER) for p in poly_m]

        min_raw_x = min(p[0] for p in raw_pixels)
        max_raw_x = max(p[0] for p in raw_pixels)
        min_raw_y = min(p[1] for p in raw_pixels)
        max_raw_y = max(p[1] for p in raw_pixels)

        padding = 150
        shift_x = -min_raw_x + padding
        shift_y = -min_raw_y + padding
        poly_pixels = [(x + shift_x, y + shift_y) for x, y in raw_pixels]

        area_m2 = void_json.get("area_m2", 0)

        boundary_config = {
            "type": "Polygon",
            "minX": padding,
            "maxX": max_raw_x - min_raw_x + padding,
            "minY": padding,
            "maxY": max_raw_y - min_raw_y + padding,
            "name": "Imported JSON Boundary",
            "gridSize": 15,
            "metadata": {
                "polygon_pixels": poly_pixels,
                "original_area_m2": area_m2,
                "grid_cell_size_m": void_json.get("grid", {}).get("cell_size_m", 6),
                "grid_rotation_deg": void_json.get("grid", {}).get("rotation_deg", 0)
            }
        }
        return {"status": "success", "boundary": boundary_config, "statistics": {"area_m2": area_m2}}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/boundary-preset")
def get_boundary_preset(name: str):
    presets = {"default": BoundaryConfig(minX=30, maxX=770, minY=70, maxY=570, name="Default Site")}
    return {"status": "success", "boundary": presets.get(name, presets["default"]).dict()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)