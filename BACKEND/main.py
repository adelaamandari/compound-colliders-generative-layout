import math
import random
import json
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from typing import List, Optional

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
    # Massing typology for the compound-colliders solver:
    #   "mat"                  – attract to nearest core; dense low-rise weave
    #   "courtyard"            – attract to a ring; open central court
    #   "swiss-cheese"         – compact cube tower with carved void holes per floor
    #   "building-blocks-stack"– perimeter block: a ring of units around one central courtyard
    #   "grand-gotto"          – terraced ziggurat (ring steps inward each floor, open grotto)
    layoutType: str = "mat"


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

class _Void:
    # A fixed, invisible obstacle box. Used by the "swiss-cheese" typology so movable
    # rooms pack AROUND it, leaving porous holes. Quacks like a Room for get_sub_boxes
    # / collision (pinned => never moves, category != Core).
    pinned = True
    category = "Void"
    rotation = 0
    flipX = False
    shapeVariant = 0
    shapePath = "0,0 100,0 100,100 0,100"

    def __init__(self, x, y, w, h):
        self.x, self.y, self.width, self.height = x, y, w, h


def get_sub_boxes(room):
    # Decompose a room into its "compound collider" sub-boxes. A simple room is a
    # single box; composite shapeVariants (L-shapes etc.) split into 2-3 boxes so the
    # collision solver can push them apart along their true footprint. Honors rotation
    # and flipX.
    is_rotated = room.rotation == 90 or room.rotation == 270
    bw = room.height if is_rotated else room.width
    bh = room.width if is_rotated else room.height

    cx = room.x + room.width / 2
    cy = room.y + room.height / 2

    x = cx - bw / 2
    y = cy - bh / 2

    v = room.shapeVariant
    if v == 1:
        unrotated_boxes = [{"x": x, "y": y, "w": 0.6*bw, "h": 0.4*bh}, {"x": x, "y": y + 0.4*bh, "w": bw, "h": 0.6*bh}]
    elif v == 2:
        unrotated_boxes = [{"x": x + 0.4*bw, "y": y, "w": 0.6*bw, "h": 0.4*bh}, {"x": x, "y": y + 0.4*bh, "w": bw, "h": 0.6*bh}]
    elif v == 3:
        unrotated_boxes = [{"x": x + 0.6*bw, "y": y, "w": 0.4*bw, "h": 0.2*bh}, {"x": x + 0.3*bw, "y": y + 0.2*bh, "w": 0.7*bw, "h": 0.3*bh}, {"x": x, "y": y + 0.5*bh, "w": bw, "h": 0.5*bh}]
    elif v == 4:
        unrotated_boxes = [{"x": x, "y": y, "w": bw, "h": 0.4*bh}, {"x": x + 0.4*bw, "y": y + 0.4*bh, "w": 0.6*bw, "h": 0.6*bh}]
    elif v == 5:
        unrotated_boxes = [{"x": x, "y": y + 0.4*bh, "w": bw, "h": 0.6*bh}, {"x": x + 0.3*bw, "y": y, "w": 0.4*bw, "h": 0.4*bh}]
    elif v == 6:
        unrotated_boxes = [{"x": x, "y": y, "w": 0.5*bw, "h": bh}, {"x": x + 0.5*bw, "y": y + 0.5*bh, "w": 0.5*bw, "h": 0.5*bh}]
    else:
        unrotated_boxes = [{"x": x, "y": y, "w": bw, "h": bh}]

    if room.flipX:
        for b in unrotated_boxes:
            b["x"] = x + (bw - ((b["x"] - x) + b["w"]))

    rotated_boxes = []
    for b in unrotated_boxes:
        bx, by, box_w, box_h = b["x"], b["y"], b["w"], b["h"]
        rx = bx - cx
        ry = by - cy
        if room.rotation == 90:
            rotated_boxes.append({"x": cx - ry - box_h, "y": cy + rx, "w": box_h, "h": box_w})
        elif room.rotation == 180:
            rotated_boxes.append({"x": cx - rx - box_w, "y": cy - ry - box_h, "w": box_w, "h": box_h})
        elif room.rotation == 270:
            rotated_boxes.append({"x": cx + ry, "y": cy - rx - box_w, "w": box_h, "h": box_w})
        else:
            rotated_boxes.append(b)

    return rotated_boxes

# ============================================================
# LAYOUT ENGINE
# ============================================================

@app.post("/api/straighten-walls")
def auto_layout(request: LayoutRequest):
    rooms = request.rooms
    boundary = request.boundary
    snap_grid = 20
    randomize = request.randomize
    layout_type = (request.layoutType or "mat").lower()

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

    # ============================================================
    # COMPOUND COLLIDERS ENGINE
    # Rooms are decomposed into sub-boxes (get_sub_boxes) and treated as soft-body
    # colliders. Per floor, movable rooms are attracted toward circulation — the
    # nearest core for "mat", or a ring around the site centre for "courtyard" — are
    # jittered while the solve is "hot", then iteratively pushed apart wherever their
    # sub-boxes overlap. Cores and pinned rooms (plus projected double-height voids in
    # `occupancy`) are fixed anchors that shove movers but never move themselves.
    # After the solve, corridors are grown as a tree BRANCHING from the core through the
    # clear gaps between rooms, so circulation reaches every room without overlapping it.
    # ============================================================
    ITERATIONS = 150
    PADDING = snap_grid                         # keep ~1 grid cell of gap between rooms
    border_margin = 12 * snap_grid              # 12 m minimum setback — keeps the build well inside the site
    corr_thick = 2 * snap_grid                  # 2 m wide corridors
    # Ring radius for the courtyard typology: rooms ring this radius so the centre
    # stays open as a court.
    ring_r = 0.3 * min(max_x - min_x, max_y - min_y)

    # Maps id(room) -> allowed footprint region rect (set per floor). Kept in a plain
    # dict (not on the Pydantic model) so lookups are always reliable.
    region_by_id = {}

    def clamp_in_site(room):
        # Keep a room's footprint inside its allowed footprint REGION (a sub-rectangle
        # of the site that shapes the typology — see floor_footprint); falls back to the
        # full site bounds. If a polygon is defined and the footprint pokes outside it,
        # pull the room back toward the site centre until it fits.
        rg = region_by_id.get(id(room))
        bx0, by0, bx1, by1 = rg if rg else (min_x, min_y, max_x, max_y)
        room.x = max(bx0, min(room.x, max(bx0, bx1 - room.width)))
        room.y = max(by0, min(room.y, max(by0, by1 - room.height)))
        if poly_pixels:
            for _ in range(8):
                if is_within_bounds(room.x, room.y, room.width, room.height,
                                    poly_pixels, min_x, max_x, min_y, max_y):
                    break
                rcx, rcy = room.x + room.width / 2, room.y + room.height / 2
                room.x += (center_x - rcx) * 0.25
                room.y += (center_y - rcy) * 0.25
                room.x = max(bx0, min(room.x, max(bx0, bx1 - room.width)))
                room.y = max(by0, min(room.y, max(by0, by1 - room.height)))

    total_floors = max(rooms_by_floor.keys()) if rooms_by_floor else 1

    # Largest per-floor movable footprint area — used to size the centred perimeter block
    # (building-blocks-stack) so its ring always has room for the rooms (no overlap/floaters)
    # and stays the SAME on every floor so the stack aligns.
    def _floor_mover_area(rms):
        return sum(r.width * r.height for r in rms
                   if "Core" not in r.category and "Corridor" not in r.category and not r.pinned)
    max_floor_area = max((_floor_mover_area(rms) for rms in rooms_by_floor.values()), default=0.0)

    def floor_footprint(lt, f, nf, floor_area=0.0):
        # Per-floor allowed footprint -> (region rects, attract_mode, void rects). Regions
        # are sub-rectangles of the site that shape the typology massing, mirroring the
        # voxel generators (grand-gotto taper, swiss-cheese holes, blocks-stack quadrants).
        W, H = max_x - min_x, max_y - min_y
        m = border_margin
        full = (min_x + m, min_y + m, max_x - m, max_y - m)
        if lt == "grand-gotto":
            # Stacked TERRACES forming a ZIGGURAT: a WIDE base that steps EVENLY inward each
            # rising floor (interpolating base_half -> apex_half across ALL nf floors), so
            # every floor is a tessellated perimeter RING that reads as a terrace on the roof
            # of the floor below. A large central GROTTO void stays open through the stack.
            cx, cy = (min_x + max_x) / 2, (min_y + max_y) / 2
            base_half = 0.46 * min(W, H)                       # wide base, fills more of the site
            apex_half = max(6 * snap_grid, base_half * 0.20)   # small top ring
            t = (f - 1) / max(1, nf - 1)                       # 0 at base .. 1 at apex
            half = max(6 * snap_grid, base_half - (base_half - apex_half) * t)
            rx0, rx1 = cx - half, cx + half
            ry0, ry1 = cy - half, cy + half
            # Thin perimeter ring (~one unit deep) around a LARGE grotto -> clear terraces.
            band = max(8 * snap_grid, 0.22 * (rx1 - rx0))
            voids, vx0, vy0, vx1, vy1 = [], rx0 + band, ry0 + band, rx1 - band, ry1 - band
            if vx1 - vx0 > 2 * snap_grid and vy1 - vy0 > 2 * snap_grid:
                voids = [(vx0, vy0, vx1 - vx0, vy1 - vy0)]
            return [(rx0, ry0, rx1, ry1)], "grotto", voids
        if lt == "swiss-cheese":
            # A COMPACT central CUBE / tower with carved void VOLUMES, rather than a
            # site-filling block scattered to the borders. Rooms pack into a centred
            # square footprint (mat attraction toward the centred cores) and a few
            # stable holes per floor subtract volume from the massing (porosity).
            cx, cy = (min_x + max_x) / 2, (min_y + max_y) / 2
            half = 0.32 * min(W, H)                 # compact tower footprint, well inside the site
            bx0, by0, bx1, by1 = cx - half, cy - half, cx + half, cy + half
            side = 2 * half
            rnd = random.Random(97 + f * 13)
            voids = []
            for _ in range(3):
                vw = rnd.uniform(side * 0.16, side * 0.26)
                vh = rnd.uniform(side * 0.16, side * 0.26)
                vx = rnd.uniform(bx0, bx1 - vw)
                vy = rnd.uniform(by0, by1 - vh)
                voids.append((vx, vy, vw, vh))
            return [(bx0, by0, bx1, by1)], "mat", voids
        if lt == "building-blocks-stack":
            # Realistic PERIMETER BLOCK (Blockrand / courtyard housing — the most buildable
            # form): a COMPACT, CENTRED ring of units wrapping a single central COURTYARD.
            # The block side is sized to the floor's room AREA so the ring always has room
            # for the rooms (no overlaps/floaters) — small & centred (big setback) when the
            # programme is light, growing only as needed and never past the setback site.
            # Same size every storey (floor_area = max across floors) so the stack aligns.
            cx, cy = (min_x + max_x) / 2, (min_y + max_y) / 2
            k = 0.26                                        # ring depth / block side
            fill = 0.38                                     # how tightly rooms pack the ring
            ring_area = (floor_area / fill) if floor_area > 0 else (0.55 * min(W, H)) ** 2
            block_side = (ring_area / (4 * k * (1 - k))) ** 0.5   # ring_area = side^2 * 4k(1-k)
            # Cap to the site. On roomy sites the block is content-sized (well below this,
            # giving a big setback); only a CRAMPED site hits the cap, where we allow a
            # smaller setback so the rooms still fit rather than overlap.
            max_side = min(W, H) - border_margin
            block_side = max(12 * snap_grid, min(block_side, max_side))
            # If a small site clamped the block, DEEPEN the ring (shrink the court) just
            # enough that the rooms still fit — so a cramped site loses courtyard before it
            # ever overlaps rooms.
            ratio = min(0.95, ring_area / (block_side ** 2))
            k = min(0.46, max(k, (1 - math.sqrt(max(0.0, 1 - ratio))) / 2))
            block_half = block_side / 2
            rx0, ry0, rx1, ry1 = cx - block_half, cy - block_half, cx + block_half, cy + block_half
            band = max(8 * snap_grid, k * (rx1 - rx0))      # perimeter depth (double-loaded)
            voids, vx0, vy0, vx1, vy1 = [], rx0 + band, ry0 + band, rx1 - band, ry1 - band
            if vx1 - vx0 > 4 * snap_grid and vy1 - vy0 > 4 * snap_grid:
                voids = [(vx0, vy0, vx1 - vx0, vy1 - vy0)]
            return [(rx0, ry0, rx1, ry1)], "grotto", voids
        if lt == "courtyard":
            return [full], "ring", []
        return [full], "mat", []

    for floor_num in sorted(rooms_by_floor.keys()):
        floor_rooms = rooms_by_floor[floor_num]

        cores      = [r for r in floor_rooms if "Core" in r.category]
        corridors  = [r for r in floor_rooms if "Corridor" in r.category]
        # Everything else (residential, communal, buffer, lobby, stairs) is movable.
        movers     = [r for r in floor_rooms
                      if "Core" not in r.category and "Corridor" not in r.category
                      and not r.pinned]
        # This floor's already-placed pinned rooms act as extra fixed colliders.
        pinned_here = [r for r in placed_rooms if r.floor == floor_num and r.pinned]

        # Per-floor typology footprint (regions / attraction mode / voids).
        regions, attract_mode, void_rects = floor_footprint(layout_type, floor_num, total_floors, max_floor_area)

        def pick_region(r):
            if len(regions) == 1:
                return regions[0]
            rc = (r.x + r.width / 2, r.y + r.height / 2)
            return min(regions, key=lambda q: ((q[0] + q[2]) / 2 - rc[0]) ** 2 + ((q[1] + q[3]) / 2 - rc[1]) ** 2)

        region_by_id.clear()

        # Core seating per typology. For "building-blocks-stack" (perimeter block) stand the
        # stair/lift cores around the central COURTYARD, one per side facing the court, so
        # every wing of the ring is served. Other typologies seat the core(s) below.
        if layout_type == "building-blocks-stack":
            base = cores[0] if cores else None
            while len(cores) < 4:
                k = len(cores)
                nc = Room(id=f"Core ({floor_num}-q{k}-{random.randint(0, 9999)})",
                          category="Circulation - Core", x=0.0, y=0.0,
                          width=(base.width if base else snap_grid * 4),
                          height=(base.height if base else snap_grid * 4),
                          bgColor=(base.bgColor if base else "rgba(154,150,144,0.30)"),
                          borderColor=(base.borderColor if base else "#9a9690"),
                          floor=floor_num)
                nc.floor_height = base.floor_height if base else FLOOR_TO_FLOOR_HEIGHT
                nc.struct_type = get_struct_type(nc.category)
                cores.append(nc)
            if void_rects:
                vx, vy, vw, vh = void_rects[0]            # the central courtyard
                cxm, cym = vx + vw / 2, vy + vh / 2
                for k, core in enumerate(cores):
                    if not core.pinned:
                        side = k % 4
                        if   side == 0: core.x, core.y = cxm - core.width / 2, vy - core.height   # N wing
                        elif side == 1: core.x, core.y = cxm - core.width / 2, vy + vh            # S wing
                        elif side == 2: core.x, core.y = vx - core.width, cym - core.height / 2   # W wing
                        else:           core.x, core.y = vx + vw, cym - core.height / 2           # E wing
                    clamp_in_site(core)
            else:
                for k, core in enumerate(cores):
                    if not core.pinned:
                        core.x = center_x - core.width / 2 + k * (core.width + snap_grid)
                        core.y = center_y - core.height / 2
                    clamp_in_site(core)
        elif layout_type == "swiss-cheese":
            # Anchors INSIDE the compact cube (regions[0]), at opposite corners of the cube
            # footprint and stacked through z — NOT out at the site border. This keeps the
            # cores within the tower so corridors stay internal and the housing packs into a
            # solid cube around them. Clone to 2 if only one core was provided.
            base = cores[0] if cores else None
            while len(cores) < 2:
                k = len(cores)
                nc = Room(id=f"Core ({floor_num}-c{k}-{random.randint(0, 9999)})",
                          category="Circulation - Core", x=0.0, y=0.0,
                          width=(base.width if base else snap_grid * 4),
                          height=(base.height if base else snap_grid * 4),
                          bgColor=(base.bgColor if base else "rgba(154,150,144,0.30)"),
                          borderColor=(base.borderColor if base else "#9a9690"),
                          floor=floor_num)
                nc.floor_height = base.floor_height if base else FLOOR_TO_FLOOR_HEIGHT
                nc.struct_type = get_struct_type(nc.category)
                cores.append(nc)
            bx0, by0, bx1, by1 = regions[0]            # the cube footprint
            corners = [
                (bx0, by0),   # NW
                (bx1, by1),   # SE
                (bx1, by0),   # NE
                (bx0, by1),   # SW
            ]
            for k, core in enumerate(cores):
                if not core.pinned:
                    cxp, cyp = corners[k % len(corners)]
                    core.x = cxp if cxp <= center_x else cxp - core.width
                    core.y = cyp if cyp <= center_y else cyp - core.height
                region_by_id[id(core)] = regions[0]    # keep cores inside the cube
                clamp_in_site(core)
        else:
            # ANCHORS FIRST, VERTICALLY CONTINUOUS (per the WFC plan-strategy logic:
            # "vertical cores are collapsed first and projected through the z-axis"). Seat
            # the core(s) at a deterministic position keyed by index on EVERY floor, so
            # they stack into a structural/service spine instead of floating at the
            # per-floor scattered spawn positions. Multiple cores are spread side by side.
            for k, core in enumerate(cores):
                if not core.pinned:
                    core.x = center_x - core.width / 2 + k * (core.width + snap_grid)
                    core.y = center_y - core.height / 2
                clamp_in_site(core)

        # Optional randomized starting scatter so each run differs.
        if randomize:
            for r in movers:
                lo_x = int(min_x + border_margin)
                hi_x = max(lo_x + 1, int(max_x - r.width - border_margin))
                lo_y = int(min_y + border_margin)
                hi_y = max(lo_y + 1, int(max_y - r.height - border_margin))
                r.x = random.randint(lo_x, hi_x)
                r.y = random.randint(lo_y, hi_y)

        def nearest_core_center(r):
            if not cores:
                return center_x, center_y
            c = min(cores, key=lambda c: math.hypot((c.x + c.width / 2) - (r.x + r.width / 2),
                                                    (c.y + c.height / 2) - (r.y + r.height / 2)))
            return c.x + c.width / 2, c.y + c.height / 2

        # Movers fill their tower/region around the anchors.
        for r in movers:
            region_by_id[id(r)] = pick_region(r)
            clamp_in_site(r)

        void_objs = [_Void(vx, vy, vw, vh) for (vx, vy, vw, vh) in void_rects]
        solver_rooms = movers + cores + pinned_here + void_objs

        for step in range(ITERATIONS):
            temp = max(0.01, 1.0 - step / ITERATIONS)

            # --- Attraction toward circulation (per massing typology footprint) ---
            for r in movers:
                r_cx, r_cy = r.x + r.width / 2, r.y + r.height / 2
                rg = region_by_id.get(id(r)) or (min_x, min_y, max_x, max_y)
                if attract_mode == "ring":
                    # Courtyard: pull toward a ring around the centre, leaving a court.
                    vx, vy = r_cx - center_x, r_cy - center_y
                    d = math.hypot(vx, vy) or 1.0
                    tx = center_x + vx / d * ring_r
                    ty = center_y + vy / d * ring_r
                    r.x += (tx - r_cx) * 0.06 * temp
                    r.y += (ty - r_cy) * 0.06 * temp
                elif attract_mode == "quad":
                    # Blocks-stack: pull into the assigned corner quadrant centre, so the
                    # central cross stays empty and 4 distinct blocks form.
                    tx, ty = (rg[0] + rg[2]) / 2, (rg[1] + rg[3]) / 2
                    r.x += (tx - r_cx) * 0.06 * temp
                    r.y += (ty - r_cy) * 0.06 * temp
                elif attract_mode == "grotto":
                    # Grand-gotto: pull rooms to the nearest edge of THIS floor's region so
                    # they form a perimeter frame, leaving the middle open as the grotto.
                    # The region tapers inward each floor -> a hollow terraced pyramid.
                    left, right = r_cx - rg[0], rg[2] - r_cx
                    top, bot = r_cy - rg[1], rg[3] - r_cy
                    mm = min(left, right, top, bot)
                    if   mm == left:  tx, ty = rg[0] + r.width / 2, r_cy
                    elif mm == right: tx, ty = rg[2] - r.width / 2, r_cy
                    elif mm == top:   tx, ty = r_cx, rg[1] + r.height / 2
                    else:             tx, ty = r_cx, rg[3] - r.height / 2
                    r.x += (tx - r_cx) * 0.09 * temp
                    r.y += (ty - r_cy) * 0.09 * temp
                else:  # mat: pull toward the nearest core, packing a dense weave
                    ccx, ccy = nearest_core_center(r)
                    r.x += (ccx - r_cx) * 0.05 * temp
                    r.y += (ccy - r_cy) * 0.05 * temp

            # --- Jitter while the solve is hot ---
            if temp > 0.2:
                for r in movers:
                    r.x += random.uniform(-1, 1) * 15 * temp
                    r.y += random.uniform(-1, 1) * 15 * temp

            # --- Collision resolution over compound sub-boxes ---
            for _ in range(3):
                for i, r1 in enumerate(solver_rooms):
                    r1_fixed = "Core" in r1.category or r1.pinned
                    boxes_1 = get_sub_boxes(r1)
                    for j in range(i + 1, len(solver_rooms)):
                        r2 = solver_rooms[j]
                        r2_fixed = "Core" in r2.category or r2.pinned
                        if r1_fixed and r2_fixed:
                            continue
                        boxes_2 = get_sub_boxes(r2)
                        for b1 in boxes_1:
                            for b2 in boxes_2:
                                c1x, c1y = b1["x"] + b1["w"] / 2, b1["y"] + b1["h"] / 2
                                c2x, c2y = b2["x"] + b2["w"] / 2, b2["y"] + b2["h"] / 2
                                dx, dy = c2x - c1x, c2y - c1y
                                min_dx = (b1["w"] + b2["w"]) / 2 + PADDING
                                min_dy = (b1["h"] + b2["h"]) / 2 + PADDING
                                if abs(dx) < min_dx and abs(dy) < min_dy:
                                    overlap_x = min_dx - abs(dx)
                                    overlap_y = min_dy - abs(dy)
                                    if overlap_x < overlap_y:
                                        force = math.copysign(overlap_x, dx or 1.0)
                                        if not r1_fixed and not r2_fixed:
                                            r1.x -= force / 2; r2.x += force / 2
                                        elif r2_fixed:
                                            r1.x -= force
                                        else:
                                            r2.x += force
                                    else:
                                        force = math.copysign(overlap_y, dy or 1.0)
                                        if not r1_fixed and not r2_fixed:
                                            r1.y -= force / 2; r2.y += force / 2
                                        elif r2_fixed:
                                            r1.y -= force
                                        else:
                                            r2.y += force
                                    boxes_1 = get_sub_boxes(r1)
                                    boxes_2 = get_sub_boxes(r2)

            # --- Keep movers inside the site ---
            for r in movers:
                clamp_in_site(r)

        # Hard separation: collision-only passes (no attraction/jitter) to clear any
        # residual overlaps the cooling solve left and open up a gap between rooms, so
        # the branch router has clear space. Stops early once nothing penetrates.
        for _ in range(120):
            moved = 0.0
            for i, r1 in enumerate(solver_rooms):
                r1_fixed = "Core" in r1.category or r1.pinned
                boxes_1 = get_sub_boxes(r1)
                for j in range(i + 1, len(solver_rooms)):
                    r2 = solver_rooms[j]
                    r2_fixed = "Core" in r2.category or r2.pinned
                    if r1_fixed and r2_fixed:
                        continue
                    boxes_2 = get_sub_boxes(r2)
                    for b1 in boxes_1:
                        for b2 in boxes_2:
                            c1x, c1y = b1["x"] + b1["w"] / 2, b1["y"] + b1["h"] / 2
                            c2x, c2y = b2["x"] + b2["w"] / 2, b2["y"] + b2["h"] / 2
                            dx, dy = c2x - c1x, c2y - c1y
                            min_dx = (b1["w"] + b2["w"]) / 2 + PADDING
                            min_dy = (b1["h"] + b2["h"]) / 2 + PADDING
                            if abs(dx) < min_dx and abs(dy) < min_dy:
                                overlap_x = min_dx - abs(dx)
                                overlap_y = min_dy - abs(dy)
                                if overlap_x < overlap_y:
                                    moved = max(moved, overlap_x)
                                    force = math.copysign(overlap_x, dx or 1.0)
                                    if not r1_fixed and not r2_fixed:
                                        r1.x -= force / 2; r2.x += force / 2
                                    elif r2_fixed:
                                        r1.x -= force
                                    else:
                                        r2.x += force
                                else:
                                    moved = max(moved, overlap_y)
                                    force = math.copysign(overlap_y, dy or 1.0)
                                    if not r1_fixed and not r2_fixed:
                                        r1.y -= force / 2; r2.y += force / 2
                                    elif r2_fixed:
                                        r1.y -= force
                                    else:
                                        r2.y += force
                                boxes_1 = get_sub_boxes(r1)
                                boxes_2 = get_sub_boxes(r2)
            for r in movers:
                clamp_in_site(r)
            if moved < 1.0:
                break

        # Register the solved (organic) room + core positions. Rooms keep the free-form
        # cluster the collider produced; corridors are grown afterwards in the gaps.
        for r in movers:
            r.x = round(r.x / snap_grid) * snap_grid
            r.y = round(r.y / snap_grid) * snap_grid
            clamp_in_site(r)
        # Grid-aligned overlap clear: snapping can close the float gap, so push any
        # still-overlapping mover away by whole grid cells until NO two rooms overlap.
        fixed_set = cores + pinned_here + void_objs
        def clamp_rect(r):
            rg = region_by_id.get(id(r)) or (min_x, min_y, max_x, max_y)
            bx0, by0, bx1, by1 = rg
            r.x = max(bx0, min(r.x, max(bx0, bx1 - r.width)))
            r.y = max(by0, min(r.y, max(by0, by1 - r.height)))
        for _ in range(300):
            hit = False
            for a in movers:
                for b in movers + fixed_set:
                    if a is b:
                        continue
                    ox = min(a.x + a.width, b.x + b.width) - max(a.x, b.x)
                    oy = min(a.y + a.height, b.y + b.height) - max(a.y, b.y)
                    if ox > 0 and oy > 0:
                        hit = True
                        b_mov = b in movers
                        # Separate along the smaller-overlap axis, moving BOTH movers
                        # apart so a room jammed against the boundary still gets cleared.
                        if ox <= oy:
                            if (a.x + a.width / 2) >= (b.x + b.width / 2):
                                a.x += snap_grid
                                if b_mov: b.x -= snap_grid
                            else:
                                a.x -= snap_grid
                                if b_mov: b.x += snap_grid
                        else:
                            if (a.y + a.height / 2) >= (b.y + b.height / 2):
                                a.y += snap_grid
                                if b_mov: b.y -= snap_grid
                            else:
                                a.y -= snap_grid
                                if b_mov: b.y += snap_grid
                        clamp_rect(a)
                        if b_mov:
                            clamp_rect(b)
            if not hit:
                break

        # Final guarantee: if a room is still wedged (a local jam the iterative push
        # can't resolve), nudge it to the nearest free slot within a few cells — a LOCAL
        # search so it stays in the cluster (no scattering) — clearing the last overlaps.
        def overlaps_any(r):
            for o in movers + fixed_set:
                if o is r:
                    continue
                if (min(r.x + r.width, o.x + o.width) - max(r.x, o.x) > 0 and
                        min(r.y + r.height, o.y + o.height) - max(r.y, o.y) > 0):
                    return True
            return False
        for r in movers:
            if not overlaps_any(r):
                continue
            ox, oy, found = r.x, r.y, False
            rrg = region_by_id.get(id(r)) or (min_x, min_y, max_x, max_y)
            for radius in range(1, 9):
                for dy in range(-radius, radius + 1):
                    for dx in range(-radius, radius + 1):
                        if max(abs(dx), abs(dy)) != radius:      # only the new ring
                            continue
                        nx, ny = ox + dx * snap_grid, oy + dy * snap_grid
                        if not (rrg[0] <= nx <= rrg[2] - r.width and rrg[1] <= ny <= rrg[3] - r.height):
                            continue
                        r.x, r.y = nx, ny
                        if not overlaps_any(r):
                            found = True
                            break
                    if found:
                        break
                if found:
                    break
            if not found:
                r.x, r.y = ox, oy

        # STACKING SUPPORT: an upper-floor room must sit on the mass below — at least 50%
        # of its footprint over a room on the floor directly beneath it (no floating
        # blocks). Any unsupported mover is nudged to the nearest spot (within its
        # typology region, no overlaps) where it gains >=50% support.
        if floor_num > 1:
            below_rects = [(p.x, p.y, p.width, p.height) for p in placed_rooms
                           if p.floor == floor_num - 1
                           and "Corridor" not in p.category and "Green" not in p.category]

            def support_frac(r):
                area = r.width * r.height
                if area <= 0 or not below_rects:
                    return 0.0
                ov = 0.0
                for bx, by, bw, bh in below_rects:
                    ix = max(0.0, min(r.x + r.width,  bx + bw) - max(r.x, bx))
                    iy = max(0.0, min(r.y + r.height, by + bh) - max(r.y, by))
                    ov += ix * iy
                return min(1.0, ov / area)

            for r in movers:
                if support_frac(r) >= 0.5:
                    continue
                ox, oy = r.x, r.y
                rrg = region_by_id.get(id(r)) or (min_x, min_y, max_x, max_y)
                best = None
                for radius in range(0, 18):
                    ring = ([(0, 0)] if radius == 0 else
                            [(dx, dy) for dy in range(-radius, radius + 1)
                             for dx in range(-radius, radius + 1)
                             if max(abs(dx), abs(dy)) == radius])
                    for dx, dy in ring:
                        nx, ny = ox + dx * snap_grid, oy + dy * snap_grid
                        if not (rrg[0] <= nx <= rrg[2] - r.width and rrg[1] <= ny <= rrg[3] - r.height):
                            continue
                        r.x, r.y = nx, ny
                        if support_frac(r) >= 0.5 and not overlaps_any(r):
                            best = (nx, ny)
                            break
                    if best:
                        break
                r.x, r.y = best if best else (ox, oy)

        # FINAL overlap clear — after stacking, guarantee no two boxes overlap (the
        # stacking nudge or a wedged room can leave residual overlaps). Push the pair
        # apart by whole cells along the smaller-overlap axis, region-clamped.
        for _ in range(250):
            hit = False
            for a in movers:
                for b in movers + fixed_set:
                    if a is b:
                        continue
                    ox = min(a.x + a.width, b.x + b.width) - max(a.x, b.x)
                    oy = min(a.y + a.height, b.y + b.height) - max(a.y, b.y)
                    if ox > 0 and oy > 0:
                        hit = True
                        b_mov = b in movers
                        if ox <= oy:
                            if (a.x + a.width / 2) >= (b.x + b.width / 2):
                                a.x += snap_grid
                                if b_mov: b.x -= snap_grid
                            else:
                                a.x -= snap_grid
                                if b_mov: b.x += snap_grid
                        else:
                            if (a.y + a.height / 2) >= (b.y + b.height / 2):
                                a.y += snap_grid
                                if b_mov: b.y -= snap_grid
                            else:
                                a.y -= snap_grid
                                if b_mov: b.y += snap_grid
                        clamp_rect(a)
                        if b_mov:
                            clamp_rect(b)
            if not hit:
                break

        # Relocate any room STILL overlapping (e.g. jammed against the fixed core, where
        # cell-pushing only trades one overlap for another) to the nearest free slot.
        # Search the whole buildable site (6 m setback), NOT just the tight typology
        # region — the region can be too small to hold every room, and a real building
        # must never have rooms inside each other. Nearest-slot search keeps the room
        # close to its typology cluster, so the massing shape still reads.
        site_bounds = (min_x + border_margin, min_y + border_margin,
                       max_x - border_margin, max_y - border_margin)
        for r in movers:
            if not overlaps_any(r):
                continue
            ox, oy, found = r.x, r.y, False
            rrg = site_bounds
            for radius in range(1, 30):
                for dy in range(-radius, radius + 1):
                    for dx in range(-radius, radius + 1):
                        if max(abs(dx), abs(dy)) != radius:
                            continue
                        nx, ny = ox + dx * snap_grid, oy + dy * snap_grid
                        if not (rrg[0] <= nx <= rrg[2] - r.width and rrg[1] <= ny <= rrg[3] - r.height):
                            continue
                        r.x, r.y = nx, ny
                        if not overlaps_any(r):
                            found = True
                            break
                    if found:
                        break
                if found:
                    break
            if not found:
                r.x, r.y = ox, oy

        # CONTAINMENT: the solver works in the rectangular AABB, but a slanted/polygon
        # site is smaller than its bounding box — rooms in the AABB corners can fall
        # OUTSIDE the actual boundary. Pull any out-of-polygon room (or core) back to the
        # nearest free, in-bounds slot.
        if poly_pixels:
            for r in movers + cores:
                if is_within_bounds(r.x, r.y, r.width, r.height, poly_pixels, min_x, max_x, min_y, max_y):
                    continue
                ox, oy, found = r.x, r.y, False
                for radius in range(1, 45):
                    for dy in range(-radius, radius + 1):
                        for dx in range(-radius, radius + 1):
                            if max(abs(dx), abs(dy)) != radius:
                                continue
                            nx, ny = ox + dx * snap_grid, oy + dy * snap_grid
                            if not (min_x <= nx <= max_x - r.width and min_y <= ny <= max_y - r.height):
                                continue
                            r.x, r.y = nx, ny
                            if (is_within_bounds(r.x, r.y, r.width, r.height, poly_pixels, min_x, max_x, min_y, max_y)
                                    and not overlaps_any(r)):
                                found = True
                                break
                        if found:
                            break
                    if found:
                        break
                if not found:
                    r.x, r.y = ox, oy

        for r in movers:
            nf = int(max(1, round(r.floor_height / FLOOR_TO_FLOOR_HEIGHT)))
            for f in range(r.floor, r.floor + nf):
                occupancy[f].append((r.x, r.y, r.width, r.height))
            placed_rooms.append(r)
        for core in cores:
            core.pinned = True
            nf = int(max(1, round(core.floor_height / FLOOR_TO_FLOOR_HEIGHT)))
            for f in range(core.floor, core.floor + nf):
                occupancy[f].append((core.x, core.y, core.width, core.height))
            placed_rooms.append(core)

        # ============================================================
        # CORRIDOR BRANCHES
        # Grow a tree of corridors OUTWARD FROM THE CORE: starting at the cores,
        # repeatedly connect the nearest not-yet-connected room to an already-connected
        # one with a short corridor that fills the clear GAP between their facing edges.
        # Every candidate corridor is validated against all rooms and existing corridors
        # first, so it never overlaps anything. The result is a branching circulation
        # network rooted at the core that reaches every reachable room.
        # ============================================================
        corr_rects = []

        def clear(rect, a, b):
            rx, ry, rw, rh = rect
            for r in movers + cores:
                if r is a or r is b:
                    continue
                if (min(rx + rw, r.x + r.width) - max(rx, r.x) > 1 and
                        min(ry + rh, r.y + r.height) - max(ry, r.y) > 1):
                    return False
            for (ox, oy, ow, oh) in corr_rects:
                if (min(rx + rw, ox + ow) - max(rx, ox) > 1 and
                        min(ry + rh, oy + oh) - max(ry, oy) > 1):
                    return False
            return True

        def gap_corridor(a, b):
            # A short corridor filling the clear gap between facing edges of a and b.
            ax0, ay0, ax1, ay1 = a.x, a.y, a.x + a.width, a.y + a.height
            bx0, by0, bx1, by1 = b.x, b.y, b.x + b.width, b.y + b.height
            ov0, ov1 = max(ay0, by0), min(ay1, by1)            # shared vertical band
            if ov1 - ov0 >= snap_grid:
                seg = min(corr_thick, ov1 - ov0)
                cy = round(((ov0 + ov1) / 2 - seg / 2) / snap_grid) * snap_grid
                if bx0 - ax1 >= snap_grid:
                    return (ax1, cy, bx0 - ax1, seg)
                if ax0 - bx1 >= snap_grid:
                    return (bx1, cy, ax0 - bx1, seg)
            ov0, ov1 = max(ax0, bx0), min(ax1, bx1)            # shared horizontal band
            if ov1 - ov0 >= snap_grid:
                seg = min(corr_thick, ov1 - ov0)
                cx = round(((ov0 + ov1) / 2 - seg / 2) / snap_grid) * snap_grid
                if by0 - ay1 >= snap_grid:
                    return (cx, ay1, seg, by0 - ay1)
                if ay0 - by1 >= snap_grid:
                    return (cx, by1, seg, ay0 - by1)
            return None

        connected = list(cores)
        remaining = list(movers)
        if not connected and remaining:
            connected = [remaining.pop(0)]          # no core: root the tree at a room
        corr_seq = 0
        while remaining:
            best = None
            for b in remaining:
                bcx, bcy = b.x + b.width / 2, b.y + b.height / 2
                for a in connected:
                    rect = gap_corridor(a, b)
                    if rect is None or not clear(rect, a, b):
                        continue
                    d = math.hypot((a.x + a.width / 2) - bcx, (a.y + a.height / 2) - bcy)
                    if best is None or d < best[0]:
                        best = (d, b, rect)
            if best is None:
                break                                # remaining rooms have no clear gap
            _, b, (rx, ry, rw, rh) = best
            corr_seq += 1
            axis = "X" if rw >= rh else "Y"
            rx = round(rx / snap_grid) * snap_grid
            ry = round(ry / snap_grid) * snap_grid
            rw = max(snap_grid, int(round(rw / snap_grid) * snap_grid))
            rh = max(snap_grid, int(round(rh / snap_grid) * snap_grid))
            placed_rooms.append(Room(
                id=f"AutoCorridor_{axis}_{floor_num}_{corr_seq}", category="Circulation - Corridor",
                x=rx, y=ry, width=rw, height=rh,
                bgColor="rgba(158,158,158,0.45)", borderColor="#9e9e9e",
                floor=floor_num, pinned=False))
            corr_rects.append((rx, ry, rw, rh))
            occupancy[floor_num].append((rx, ry, rw, rh))
            connected.append(b)
            remaining.remove(b)

        # BRIDGES (building-blocks-stack): link the cores standing around the courtyard
        # with corridors ACROSS the open court, so opposite wings of the perimeter block
        # are connected (like the reference bridges).
        if layout_type == "building-blocks-stack" and len(cores) >= 2:
            for ci in range(len(cores)):
                for cj in range(ci + 1, len(cores)):
                    rect = gap_corridor(cores[ci], cores[cj])
                    if rect is None or not clear(rect, cores[ci], cores[cj]):
                        continue
                    rx, ry, rw, rh = rect
                    rx = round(rx / snap_grid) * snap_grid
                    ry = round(ry / snap_grid) * snap_grid
                    rw = max(snap_grid, int(round(rw / snap_grid) * snap_grid))
                    rh = max(snap_grid, int(round(rh / snap_grid) * snap_grid))
                    corr_seq += 1
                    axis = "X" if rw >= rh else "Y"
                    placed_rooms.append(Room(
                        id=f"Bridge_{axis}_{floor_num}_{corr_seq}", category="Circulation - Corridor",
                        x=rx, y=ry, width=rw, height=rh,
                        bgColor="rgba(158,158,158,0.45)", borderColor="#9e9e9e",
                        floor=floor_num, pinned=False))
                    corr_rects.append((rx, ry, rw, rh))
                    occupancy[floor_num].append((rx, ry, rw, rh))

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