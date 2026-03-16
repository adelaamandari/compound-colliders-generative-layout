import math
import random
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    
    # --- ADDED FIELDS TO PREVENT DATA LOSS ---
    area: Optional[float] = None
    score: Optional[float] = None
    optName: Optional[str] = None

    # Allows any unknown frontend fields to pass through without being deleted
    model_config = ConfigDict(extra="allow") 

class LayoutRequest(BaseModel):
    targetUser: str
    activeFloor: int 
    rooms: List[Room]
    randomize: bool = False

states = ["SK", "SL", "GR", "W", "L", "CP", "MR", "MH", "MC", "G", "ER", "IP", "GA", "OP", "S1", "S2", "S3", "S4", "S5", "Corridor", "Core", "Entrance", "Stairs"]
adjacency_matrix = {state_A: {state_B: 1.0 for state_B in states} for state_A in states}

def set_weight(room_a, room_b, weight):
    if room_a in adjacency_matrix and room_b in adjacency_matrix:
        adjacency_matrix[room_a][room_b] = weight
        adjacency_matrix[room_b][room_a] = weight

residential_units = ["S1", "S2", "S3", "S4", "S5"]
set_weight("SK", "Core", 3.0)
set_weight("SL", "SK", 2.0)
for res in residential_units:
    set_weight("GR", res, 0.0) 
    set_weight("G", res, 0.0)  
set_weight("L", "GR", 0.0)
set_weight("L", "SL", 0.0)

for res in residential_units:
    set_weight(res, "Corridor", 2.0)
set_weight("Corridor", "Core", 3.0) 

def get_shortcode(category_str):
    name = category_str.split(" - ")[-1]
    mapping = {
        "Shared Kitchen": "SK", "Shared Living Room": "SL", "Game Room": "GR",
        "Workspace Room": "W", "Library": "L", "Concentration Pod": "CP", "Meeting Room": "MR",
        "Multi-purpose Hall": "MH", "Mini Cinema": "MC", "Gym": "G", "Events Room": "ER",
        "Indoor Play Area": "IP", "Garden": "GA", "Outdoor Playground": "OP",
        "Studio": "S1", "1 Bedroom": "S2", "2 Bedroom": "S3", "3 Bedroom": "S4", "4 Bedroom": "S5",
        "Core": "Core", "Stairs": "Stairs", "Corridor": "Corridor"
    }
    return mapping.get(name, "S1")

def get_sub_boxes(room):
    is_rotated = room.rotation == 90 or room.rotation == 270
    bw = room.height if is_rotated else room.width
    bh = room.width if is_rotated else room.height
    
    cx = room.x + room.width / 2
    cy = room.y + room.height / 2
    
    x = cx - bw / 2
    y = cy - bh / 2

    v = room.shapeVariant
    unrotated_boxes = []
    
    if v == 0:
        unrotated_boxes = [{"x": x, "y": y, "w": bw, "h": bh}]
    elif v == 1:
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

@app.post("/api/straighten-walls")
def auto_layout(request: LayoutRequest):
    rooms = request.rooms
    active_floor = request.activeFloor 
    should_randomize = request.randomize 
    
    padding = 2 
    corridor_thickness = 30 
    
    min_x_bound = 30  
    max_x_bound = 770 
    min_y_bound = 70  
    max_y_bound = 570 

    rooms = [r for r in rooms if not (r.id.startswith("AutoCorridor") and r.floor == active_floor)]
    
    snap_grid = 15

    if should_randomize:
        for r in rooms:
            if r.floor == active_floor and "Core" not in r.category and "Stairs" not in r.category and not r.pinned:
                safe_min_x = int(min_x_bound + 10)
                safe_max_x = max(safe_min_x + 1, int(max_x_bound - r.width - 10))
                safe_min_y = int(min_y_bound + 10)
                safe_max_y = max(safe_min_y + 1, int(max_y_bound - r.height - 10))
                
                r.x = round(random.randint(safe_min_x, safe_max_x) / snap_grid) * snap_grid
                r.y = round(random.randint(safe_min_y, safe_max_y) / snap_grid) * snap_grid

    iterations = 150 
    
    for step in range(iterations):
        temp = max(0.01, 1.0 - (step / iterations))

        for i, room_a in enumerate(rooms):
            if room_a.floor != active_floor: continue 
            if "Core" in room_a.category or room_a.pinned: continue 
            
            core = next((c for c in rooms if c.floor == room_a.floor and "Core" in c.category), None)
            
            if core and "Circulation" not in room_a.category:
                c_cx, c_cy = core.x + core.width/2, core.y + core.height/2
                r_cx, r_cy = room_a.x + room_a.width/2, room_a.y + room_a.height/2
                dx, dy = c_cx - r_cx, c_cy - r_cy
                
                if abs(dx) < abs(dy):
                    room_a.x += dx * 0.05 * temp
                    gap = (corridor_thickness/2 + room_a.width/2) + padding
                    if abs(dx) < gap:
                        room_a.x -= math.copysign(gap - abs(dx), dx) * 1.5 * temp
                else:
                    room_a.y += dy * 0.05 * temp
                    gap = (corridor_thickness/2 + room_a.height/2) + padding
                    if abs(dy) < gap:
                        room_a.y -= math.copysign(gap - abs(dy), dy) * 1.5 * temp
            else:
                room_a.x += (400 - (room_a.x + room_a.width/2)) * 0.02 * temp
                room_a.y += (300 - (room_a.y + room_a.height/2)) * 0.02 * temp

        if temp > 0.2:
            for r in rooms:
                if r.floor == active_floor and not r.pinned and "Core" not in r.category:
                    r.x += random.uniform(-1, 1) * 15 * temp
                    r.y += random.uniform(-1, 1) * 15 * temp

        for _ in range(3):
            for i, r1 in enumerate(rooms):
                if r1.floor != active_floor: continue 
                r1_is_fixed = "Core" in r1.category or r1.pinned
                boxes_1 = get_sub_boxes(r1)

                for j, r2 in enumerate(rooms):
                    if i >= j or r1.floor != r2.floor: continue 
                    r2_is_fixed = "Core" in r2.category or r2.pinned
                    boxes_2 = get_sub_boxes(r2)

                    for b1 in boxes_1:
                        for b2 in boxes_2:
                            c1x, c1y = b1["x"] + b1["w"]/2, b1["y"] + b1["h"]/2
                            c2x, c2y = b2["x"] + b2["w"]/2, b2["y"] + b2["h"]/2
                            dx, dy = c2x - c1x, c2y - c1y
                            
                            min_dx = (b1["w"] + b2["w"])/2 + padding
                            min_dy = (b1["h"] + b2["h"])/2 + padding

                            if abs(dx) < min_dx and abs(dy) < min_dy:
                                overlap_x = min_dx - abs(dx)
                                overlap_y = min_dy - abs(dy)

                                if overlap_x < overlap_y:
                                    force = overlap_x
                                    if dx > 0:
                                        if not r1_is_fixed and not r2_is_fixed:
                                            r1.x -= force / 2
                                            r2.x += force / 2
                                        elif r1_is_fixed and not r2_is_fixed:
                                            r2.x += force
                                        elif not r1_is_fixed and r2_is_fixed:
                                            r1.x -= force
                                    else:
                                        if not r1_is_fixed and not r2_is_fixed:
                                            r1.x += force / 2
                                            r2.x -= force / 2
                                        elif r1_is_fixed and not r2_is_fixed:
                                            r2.x -= force
                                        elif not r1_is_fixed and r2_is_fixed:
                                            r1.x += force
                                else:
                                    force = overlap_y
                                    if dy > 0:
                                        if not r1_is_fixed and not r2_is_fixed:
                                            r1.y -= force / 2
                                            r2.y += force / 2
                                        elif r1_is_fixed and not r2_is_fixed:
                                            r2.y += force
                                        elif not r1_is_fixed and r2_is_fixed:
                                            r1.y -= force
                                    else:
                                        if not r1_is_fixed and not r2_is_fixed:
                                            r1.y += force / 2
                                            r2.y -= force / 2
                                        elif r1_is_fixed and not r2_is_fixed:
                                            r2.y -= force
                                        elif not r1_is_fixed and r2_is_fixed:
                                            r1.y += force
                                
                                boxes_1 = get_sub_boxes(r1)
                                boxes_2 = get_sub_boxes(r2)

        for r in rooms:
            if r.floor != active_floor: continue 
            if "Core" in r.category or r.pinned: continue
            r.x = max(min_x_bound, min(r.x, max_x_bound - r.width))
            r.y = max(min_y_bound, min(r.y, max_y_bound - r.height))

    for room in rooms:
        if room.floor == active_floor:
            if not room.pinned and "Core" not in room.category:
                room.x = round(room.x / snap_grid) * snap_grid
                room.y = round(room.y / snap_grid) * snap_grid
                room.x = max(min_x_bound, min(room.x, max_x_bound - room.width))
                room.y = max(min_y_bound, min(room.y, max_y_bound - room.height))

    floor_rooms = [r for r in rooms if r.floor == active_floor]
    core = next((r for r in floor_rooms if "Core" in r.category), None)

    if core:
        cluster_min_x = min(r.x for r in floor_rooms)
        cluster_max_x = max(r.x + r.width for r in floor_rooms)
        cluster_min_y = min(r.y for r in floor_rooms)
        cluster_max_y = max(r.y + r.height for r in floor_rooms)

        c_cx = core.x + core.width/2
        c_cy = core.y + core.height/2

        cx_min, cx_max = core.x, core.x + core.width
        cy_min, cy_max = core.y, core.y + core.height

        new_corridors = []
        if cluster_min_x < cx_min - 10:
            new_corridors.append(Room(id=f"AutoCorridor_L_{active_floor}", category="Circulation - Corridor", x=cluster_min_x, y=c_cy - corridor_thickness/2, width=cx_min - cluster_min_x, height=corridor_thickness, bgColor='rgba(158, 158, 158, 0.4)', borderColor='#9e9e9e', floor=active_floor, pinned=True, rotation=0, shapeVariant=0, shapePath="0,0 100,0 100,100 0,100", area=None))
        if cluster_max_x > cx_max + 10:
            new_corridors.append(Room(id=f"AutoCorridor_R_{active_floor}", category="Circulation - Corridor", x=cx_max, y=c_cy - corridor_thickness/2, width=cluster_max_x - cx_max, height=corridor_thickness, bgColor='rgba(158, 158, 158, 0.4)', borderColor='#9e9e9e', floor=active_floor, pinned=True, rotation=0, shapeVariant=0, shapePath="0,0 100,0 100,100 0,100", area=None))
        if cluster_min_y < cy_min - 10:
            new_corridors.append(Room(id=f"AutoCorridor_T_{active_floor}", category="Circulation - Corridor", x=c_cx - corridor_thickness/2, y=cluster_min_y, width=corridor_thickness, height=cy_min - cluster_min_y, bgColor='rgba(158, 158, 158, 0.4)', borderColor='#9e9e9e', floor=active_floor, pinned=True, rotation=0, shapeVariant=0, shapePath="0,0 100,0 100,100 0,100", area=None))
        if cluster_max_y > cy_max + 10:
            new_corridors.append(Room(id=f"AutoCorridor_B_{active_floor}", category="Circulation - Corridor", x=c_cx - corridor_thickness/2, y=cy_max, width=corridor_thickness, height=cluster_max_y - cy_max, bgColor='rgba(158, 158, 158, 0.4)', borderColor='#9e9e9e', floor=active_floor, pinned=True, rotation=0, shapeVariant=0, shapePath="0,0 100,0 100,100 0,100", area=None))

        rooms.extend(new_corridors)

    active_rules = []
    for room_a in rooms:
        code_a = get_shortcode(room_a.category)
        closest_targets = {}
        
        for room_b in rooms:
            if room_a.id == room_b.id or room_a.floor != room_b.floor: continue 
            code_b = get_shortcode(room_b.category)
            w = adjacency_matrix[code_a][code_b]
            
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

    return {"status": "success", "rooms": rooms, "rules": unique_rules}