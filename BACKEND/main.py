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
    # Massing typology: "towers" (spread point blocks), "mat" (merged low-rise
    # weave) or "courtyard" (rooms ring a central court). Drives core spread and
    # how rooms are pulled relative to the cores / site centre.
    layoutType: str = "towers"


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
    layout_type = (request.layoutType or "towers").lower()

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

    # Structural systems that sit comfortably next to each other (shared grid).
    struct_adjacency = {
        ("C1", "C2A"), ("C2A", "C1"),
        ("C2A", "C2B"), ("C2B", "C2A"),
        ("C2B", "C3"), ("C3", "C2B"),
        ("C3", "C4"), ("C4", "C3"),
    }

    # Keep everything a little off the site edge so masses don't snap to the
    # boundary line.
    border_margin = 3 * snap_grid  # 3 m inset from the site border

    def within_site(x, y, w, h):
        # True only when the footprint PLUS a border margin sits inside the site,
        # which effectively insets the usable area away from the boundary.
        return is_within_bounds(x - border_margin, y - border_margin,
                                w + 2 * border_margin, h + 2 * border_margin,
                                poly_pixels, min_x, max_x, min_y, max_y)

    def shares_edge(x, y, w, h, p):
        # True when rect (x, y, w, h) is flush against room p on any side.
        v_overlap = min(y + h, p.y + p.height) - max(y, p.y)
        h_overlap = min(x + w, p.x + p.width) - max(x, p.x)
        touch_x = (x == p.x + p.width or x + w == p.x) and v_overlap > 0
        touch_y = (y == p.y + p.height or y + h == p.y) and h_overlap > 0
        return touch_x or touch_y

    # For "towers", cores on floors above 1 stack directly over the floor-1
    # cores (a real tower) instead of being spread independently per floor.
    tower_core_positions = []

    for floor_num in sorted(rooms_by_floor.keys()):
        floor_rooms = rooms_by_floor[floor_num]

        cores      = [r for r in floor_rooms if "Core" in r.category]
        corridors  = [r for r in floor_rooms if "Corridor" in r.category]
        lobbies    = [r for r in floor_rooms if "Lobby" in r.category]
        communals  = [r for r in floor_rooms if "Communal" in r.category or "Buffer" in r.category]
        residential = [r for r in floor_rooms
                       if r not in cores and r not in corridors
                       and r not in communals and r not in lobbies]

        for core_idx, core in enumerate(cores):
            floor_occ = occupancy.get(floor_num, [])
            half_w, half_h = core.width / 2, core.height / 2

            if layout_type == "towers" and floor_num > 1 and core_idx < len(tower_core_positions):
                # Stack this upper-floor core directly over its floor-1 core (a tower).
                cx, cy = tower_core_positions[core_idx]
            elif not floor_occ:
                cx, cy = center_x, center_y
            else:
                # Keep masses CENTRAL: pick the non-overlapping slot closest to the
                # site centre that is still at least `min_gap` from the cores already
                # placed — so towers stay distinct without being flung to the border.
                min_gap = 0 if layout_type == "mat" else 18 * snap_grid
                best_metric = float('inf')
                best_pos = (center_x, center_y)
                relaxed_metric, relaxed_pos = float('inf'), (center_x, center_y)
                for x in range(min_x, max_x, snap_grid * 2):
                    for y in range(min_y, max_y, snap_grid * 2):
                        if not within_site(x, y, core.width, core.height):
                            continue
                        if is_overlap(x, y, core.width, core.height, floor_num, occupancy):
                            continue
                        ccx, ccy = x + half_w, y + half_h
                        dcenter = math.hypot(ccx - center_x, ccy - center_y)
                        if dcenter < relaxed_metric:
                            relaxed_metric, relaxed_pos = dcenter, (ccx, ccy)
                        dmin = min(math.hypot(ccx - (ox + ow / 2), ccy - (oy + oh / 2))
                                   for ox, oy, ow, oh in floor_occ)
                        if dmin < min_gap:
                            continue
                        if dcenter < best_metric:
                            best_metric, best_pos = dcenter, (ccx, ccy)
                cx, cy = best_pos if best_metric < float('inf') else relaxed_pos

            cx = (int(cx - half_w) // snap_grid) * snap_grid
            cy = (int(cy - half_h) // snap_grid) * snap_grid

            if not within_site(cx, cy, core.width, core.height):
                cx, cy = min_x + border_margin, min_y + border_margin

            core.x, core.y, core.pinned = cx, cy, True

            if floor_num == 1:
                tower_core_positions.append((core.x + half_w, core.y + half_h))

            # PROJECT VOIDS UPWARDS
            num_floors = int(max(1, round(core.floor_height / FLOOR_TO_FLOOR_HEIGHT)))
            for f in range(core.floor, core.floor + num_floors):
                occupancy[f].append((cx, cy, core.width, core.height))
            placed_rooms.append(core)

        # --- Lobby: a single shared entrance. Park it flush against the most
        # central core so Public Buffer Zone rooms can cluster by it. ---
        lobby_center = None
        floor_core_rooms = [r for r in placed_rooms if r.floor == floor_num and "Core" in r.category]
        for lobby in lobbies:
            anchor_core = min(floor_core_rooms,
                              key=lambda c: math.hypot(c.x + c.width / 2 - center_x,
                                                       c.y + c.height / 2 - center_y),
                              default=None)
            placed_lobby = False
            if anchor_core is not None:
                ccx = anchor_core.x + anchor_core.width / 2
                for lx, ly in [(anchor_core.x, anchor_core.y + anchor_core.height),
                               (anchor_core.x, anchor_core.y - lobby.height),
                               (anchor_core.x + anchor_core.width, anchor_core.y),
                               (anchor_core.x - lobby.width, anchor_core.y)]:
                    lx = (int(lx) // snap_grid) * snap_grid
                    ly = (int(ly) // snap_grid) * snap_grid
                    if within_site(lx, ly, lobby.width, lobby.height) and not is_overlap(lx, ly, lobby.width, lobby.height, floor_num, occupancy):
                        lobby.x, lobby.y, lobby.pinned = lx, ly, False
                        occupancy[floor_num].append((lx, ly, lobby.width, lobby.height))
                        placed_rooms.append(lobby)
                        lobby_center = (lx + lobby.width / 2, ly + lobby.height / 2)
                        placed_lobby = True
                        break
            if not placed_lobby:
                lobby_center = (center_x, center_y)

        # ============================================================
        # CLUSTERED MASSING  (compound-colliders circulation)
        # Each core anchors one compact building mass. Every mass gets a 2 m
        # corridor spine placed FIRST, hard up against its core (Core<->Corridor
        # is the strongest adjacency), then the communal + residential rooms
        # pack along that core/corridor spine. Result: several distinct masses,
        # each a core wired to a corridor with rooms hanging off it.
        # ============================================================
        floor_cores = [r for r in placed_rooms if r.floor == floor_num and "Core" in r.category]

        clusters = [{"core": c, "anchor": (c.x + c.width / 2, c.y + c.height / 2),
                     "spines": [], "rooms": [], "placed": [c]}
                    for c in floor_cores]
        if not clusters:
            # No core on this floor: fall back to a single mass centred on site.
            clusters = [{"core": None, "anchor": (center_x, center_y),
                         "spines": [], "rooms": [], "placed": []}]

        # Give each mass a corridor spine (round-robin over the cores).
        for idx, cor in enumerate(corridors):
            clusters[idx % len(clusters)]["spines"].append(cor)

        # Public Buffer Zone rooms belong by the single lobby, so route them all
        # to the mass nearest the lobby; everything else spreads round-robin so
        # the masses stay roughly balanced in size.
        buffers = [r for r in communals if "Buffer" in r.category]
        others  = [r for r in communals if "Buffer" not in r.category] + residential
        if randomize:
            random.shuffle(others)
        else:
            others.sort(key=lambda r: -(r.width * r.height))
        for idx, room in enumerate(others):
            clusters[idx % len(clusters)]["rooms"].append(room)

        lobby_cluster = clusters[0]
        if lobby_center is not None and clusters[0]["core"] is not None:
            lobby_cluster = min(clusters, key=lambda cl: math.hypot(cl["anchor"][0] - lobby_center[0],
                                                                    cl["anchor"][1] - lobby_center[1]))
        # Let the lobby act as circulation its mass's buffer rooms can attach to.
        for lb in [r for r in placed_rooms if r.floor == floor_num and "Lobby" in r.category]:
            if lb not in lobby_cluster["placed"]:
                lobby_cluster["placed"].append(lb)
        for room in buffers:
            lobby_cluster["rooms"].append(room)

        # Pack each mass as a COMPACT BLOCK: rooms in a tight grid centred on the
        # core, threaded by parallel corridors (a comb) so the footprint stays
        # square-ish (not a long thin slab) and every room still sits flush against
        # a corridor. Courtyard leaves a central block of cells open as a court.
        corridor_thick = 2 * snap_grid       # 2 m wide

        def place_room(room, x, y):
            x = (int(x) // snap_grid) * snap_grid
            y = (int(y) // snap_grid) * snap_grid
            if not within_site(x, y, room.width, room.height):
                return False
            if is_overlap(x, y, room.width, room.height, floor_num, occupancy):
                return False
            room.x, room.y = x, y
            nf = int(max(1, round(room.floor_height / FLOOR_TO_FLOOR_HEIGHT)))
            for f in range(room.floor, room.floor + nf):
                occupancy[f].append((x, y, room.width, room.height))
            placed_rooms.append(room)
            return True

        def place_anywhere(room):
            for gx in range(min_x, max_x, snap_grid):
                for gy in range(min_y, max_y, snap_grid):
                    if place_room(room, gx, gy):
                        return True
            return False

        # Corridors are drawn from a shared pool of the floor's corridor rooms;
        # extra segments are cloned from a template so the comb can always reach
        # every room.
        corridor_pool = list(corridors)
        corridor_template = corridors[0] if corridors else None
        corr_n = [0]

        def lay_corridor(x, y, w, h):
            if w < snap_grid or h < snap_grid:
                return
            if corridor_pool:
                c = corridor_pool.pop()
            elif corridor_template is not None:
                corr_n[0] += 1
                c = corridor_template.model_copy(update={"id": f"AutoCorr-{floor_num}-{corr_n[0]}"})
            else:
                return
            c.x = (int(x) // snap_grid) * snap_grid
            c.y = (int(y) // snap_grid) * snap_grid
            c.width = max(snap_grid, int(w))
            c.height = max(snap_grid, int(h))
            c.pinned, c.rotation = False, 0
            occupancy[floor_num].append((c.x, c.y, c.width, c.height))
            placed_rooms.append(c)

        def pack_comb(rms, cx_c, cy_c, court=False):
            rms = sorted(rms, key=lambda r: (0 if "Buffer" in r.category else 1, -(r.width * r.height)))
            if randomize:
                random.shuffle(rms)
            n = len(rms)
            if n == 0:
                return
            cw = max(r.width for r in rms)
            ch = max(r.height for r in rms)
            cols = max(1, int(round(math.sqrt(n))) + (1 if court else 0))

            # Central reserved cells: a court (courtyard) or a single cell for the core.
            def reserved(rows):
                if court and rows >= 3 and cols >= 3:
                    return max(1, cols // 3), max(1, rows // 3)
                # Reserve a 2-wide centre for the core + lobby so grid rooms don't
                # collide with them and get bumped off the corridor.
                return (min(2, cols), 1) if (rows >= 2 and cols >= 2) else (0, 0)

            rows = max(1, (n + cols - 1) // cols)
            while True:
                rc, rr = reserved(rows)
                if cols * rows - rc * rr >= n:
                    break
                rows += 1
            rc, rr = reserved(rows)
            res_c0, res_r0 = (cols - rc) // 2, (rows - rr) // 2

            # Vertical layout: corridor, (room-row, room-row), corridor, ... centred.
            # Top rows of a pair touch the corridor ABOVE (top-aligned), bottom rows
            # touch the corridor BELOW (bottom-aligned), so even short rooms stay flush.
            band_y, corr_y, row_kind = [], [], []
            y = 0.0
            corr_y.append(y); y += corridor_thick
            ri = 0
            while ri < rows:
                band_y.append(y); row_kind.append("top"); y += ch; ri += 1
                if ri < rows:
                    band_y.append(y); row_kind.append("bottom"); y += ch; ri += 1
                corr_y.append(y); y += corridor_thick
            block_w = cols * cw
            left = cx_c - block_w / 2.0
            top = cy_c - y / 2.0

            cells = []
            for r in range(rows):
                for c in range(cols):
                    if rr > 0 and res_r0 <= r < res_r0 + rr and res_c0 <= c < res_c0 + rc:
                        continue
                    cells.append((r, c))

            for room, (r, c) in zip(rms, cells):
                rx = left + c * cw
                ry = top + band_y[r] if row_kind[r] == "top" else top + band_y[r] + ch - room.height
                if not place_room(room, rx, ry):
                    place_anywhere(room)

            # Drop a green court into the reserved central cells (courtyard typology).
            if court and rr > 0 and corridor_template is not None:
                gx = (int(left + res_c0 * cw) // snap_grid) * snap_grid
                gy = (int(top + band_y[res_r0]) // snap_grid) * snap_grid
                gw = max(snap_grid, int(rc * cw))
                gh = max(snap_grid, int(band_y[min(res_r0 + rr - 1, len(band_y) - 1)] + ch - band_y[res_r0]))
                if within_site(gx, gy, gw, gh):
                    court_room = corridor_template.model_copy(update={
                        "id": f"AutoCourt-{floor_num}",
                        "category": "Public Buffer Zone - Garden",
                        "x": gx, "y": gy, "width": gw, "height": gh,
                        "bgColor": "#7d8a6a", "borderColor": "#5d6a4d",
                        "pinned": False, "rotation": 0,
                    })
                    occupancy[floor_num].append((gx, gy, gw, gh))
                    placed_rooms.append(court_room)

            for cyb in corr_y:
                lay_corridor(left, top + cyb, block_w, corridor_thick)

        if layout_type == "courtyard":
            # One central ring of rooms around an open green court.
            all_rooms = [r for cl in clusters for r in cl["rooms"]]
            pack_comb(all_rooms, center_x, center_y, court=True)
        else:
            for cluster in clusters:
                core = cluster["core"]
                if core is not None:
                    pack_comb(cluster["rooms"], core.x + core.width / 2, core.y + core.height / 2)
                else:
                    pack_comb(cluster["rooms"], center_x, center_y)
            # Extra spines for this mass are dropped (not returned).

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