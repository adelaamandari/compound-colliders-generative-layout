#!/usr/bin/env python3
"""
Procedural Building Layout Generator - Triangular Aggregation

"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap, BoundaryNorm
from matplotlib.patches import Patch
import random

# ------------------------------------------------------------------
# Grid value constants
# ------------------------------------------------------------------
EMPTY      = 0
COMMUNAL   = 1     
STAIRS     = 2
LIFT       = 3
STUDIO     = 4
BR1        = 5
BR2        = 6
BR3        = 7
BR4        = 8
BUFFER     = 9     
PUBLIC_CA  = 10
CORRIDOR   = 11    

# Monochrome palette with Red highlights for the cores
COLORS = [
    '#FFFFFF',  # 0 Empty / Background
    '#E0E0E0',  # 1 Communal
    '#FF3333',  # 2 Stairs
    '#990000',  # 3 Lift
    '#D9D9D9',  # 4 Studio
    '#BFBFBF',  # 5 1 Bedroom
    '#A6A6A6',  # 6 2 Bedroom
    '#8C8C8C',  # 7 3 Bedroom
    '#595959',  # 8 4 Bedroom
    '#F2F2F2',  # 9 Buffer Zone
    '#737373',  # 10 Public CA
    '#FFFFFF',  # 11 Corridor
]

LABELS = [
    'Empty', 
    'Private Communal', 
    'Stairs (Core)', 
    'Lift (Core)',
    'Studio (Prof.)', 
    '1 Bed (Family)', 
    '2 Bed (Hybrid)', 
    '3 Bed (Family)',
    '4 Bed (Student)', 
    'Buffer Zone', 
    'Public CA', 
    'Corridor'
]

# ------------------------------------------------------------------
# Placement helpers
# ------------------------------------------------------------------
def place_block(grid, value, x, y, w, h, unit_bounds=None):
    H, W = grid.shape
    if x < 0 or y < 0 or x + w > W or y + h > H:
        return False
    if np.any(grid[y:y+h, x:x+w] != EMPTY):
        return False
    grid[y:y+h, x:x+w] = value
    if unit_bounds is not None:
        unit_bounds.append((x, y, w, h, value))
    return True

def add_core(grid, x, y, bounds=None):
    if x + 2 > grid.shape[1] or y >= grid.shape[0]:
        return False
    if grid[y, x] != EMPTY or grid[y, x+1] != EMPTY:
        return False
    grid[y, x]     = STAIRS
    grid[y, x + 1] = LIFT
    if bounds is not None:
        bounds.append((x, y, 1, 1, STAIRS))
        bounds.append((x+1, y, 1, 1, LIFT))
    return True

# ------------------------------------------------------------------
# Cluster fillers 
# ------------------------------------------------------------------
def fill_student(grid, x0, y0, w, h, bounds):
    y = y0
    while y + 2 <= y0 + h:
        x = x0
        row_units = 0
        while x < x0 + w:
            if x + 5 <= x0 + w and place_block(grid, BR4, x, y, 5, 2, bounds):
                x += 5; row_units += 1
                if row_units % 2 == 0 and x + 2 <= x0 + w:
                    place_block(grid, COMMUNAL, x, y, 2, 2, bounds)
                    x += 2
            elif x + 2 <= x0 + w and place_block(grid, COMMUNAL, x, y, 2, 2, bounds):
                x += 2
            else:
                break
        y += 2

def fill_hybrid(grid, x0, y0, w, h, bounds):
    y = y0
    while y + 2 <= y0 + h:
        x = x0
        row_units = 0
        while x < x0 + w:
            if x + 4 <= x0 + w and place_block(grid, BR2, x, y, 4, 2, bounds):
                x += 4; row_units += 1
                if row_units % 2 == 0 and x + 2 <= x0 + w:
                    place_block(grid, COMMUNAL, x, y, 2, 2, bounds)
                    x += 2
            elif x + 2 <= x0 + w and place_block(grid, COMMUNAL, x, y, 2, 2, bounds):
                x += 2
            else:
                break
        y += 2

def fill_professional(grid, x0, y0, w, h, bounds):
    y = y0
    while y + 2 <= y0 + h:
        x = x0
        g_studio = 0
        g_2br = 0
        while x < x0 + w:
            placed = False
            if (x + 4 <= x0 + w and g_2br < 1 and random.random() < 0.40
                    and place_block(grid, BR2, x, y, 4, 2, bounds)):
                x += 4; g_2br += 1; placed = True
            elif x + 2 <= x0 + w and place_block(grid, STUDIO, x, y, 2, 2, bounds):
                x += 2; g_studio += 1; placed = True
            if not placed:
                break
            if g_studio >= 2 and g_2br >= 1 and x + 2 <= x0 + w:
                place_block(grid, COMMUNAL, x, y, 2, 2, bounds)
                x += 2
                g_studio = g_2br = 0
        y += 2

def fill_family(grid, x0, y0, w, h, bounds):
    y = y0
    row_toggle = 0
    while y + 2 <= y0 + h:
        x = x0
        g_1, g_3 = 0, 0
        prefer_small_row = (row_toggle % 2 == 0)
        while x < x0 + w:
            placed = False
            if prefer_small_row:
                if x + 3 <= x0 + w and place_block(grid, BR1, x, y, 3, 2, bounds):
                    x += 3; g_1 += 1; placed = True
                elif x + 4 <= x0 + w and place_block(grid, BR3, x, y, 4, 2, bounds):
                    x += 4; g_3 += 1; placed = True
            else:
                if x + 4 <= x0 + w and place_block(grid, BR3, x, y, 4, 2, bounds):
                    x += 4; g_3 += 1; placed = True
                elif x + 3 <= x0 + w and place_block(grid, BR1, x, y, 3, 2, bounds):
                    x += 3; g_1 += 1; placed = True
            if not placed:
                if x + 2 <= x0 + w and place_block(grid, COMMUNAL, x, y, 2, 2, bounds):
                    x += 2
                else:
                    break
            if g_1 >= 2 and g_3 >= 1 and x + 2 <= x0 + w:
                place_block(grid, COMMUNAL, x, y, 2, 2, bounds)
                x += 2
                g_1 = 0
                g_3 = max(0, g_3 - 1)
        y += 2
        row_toggle += 1

# ------------------------------------------------------------------
# Seed Creation & Porous Triangular Aggregation
# ------------------------------------------------------------------
def create_staggered_module():
    grid = np.zeros((20, 20), dtype=int)
    bounds = []
    
    add_core(grid, 8, 9, bounds)
    for y in range(8, 12):
        for x in range(8, 12):
            if grid[y, x] == EMPTY:
                place_block(grid, CORRIDOR, x, y, 1, 1, bounds)

    fill_professional(grid, 2, 4, 6, 6, bounds)  
    fill_student(grid, 12, 10, 6, 6, bounds)     
    fill_hybrid(grid, 10, 2, 6, 6, bounds)       
    fill_family(grid, 4, 12, 6, 6, bounds)       
    
    return grid, bounds

def stamp_module(site_grid, site_bounds, module_grid, module_bounds, start_x, start_y):
    h, w = module_grid.shape
    site_h, site_w = site_grid.shape
    placed_mask = np.zeros_like(module_grid, dtype=bool)

    for y in range(h):
        for x in range(w):
            v = module_grid[y, x]
            if v != EMPTY:
                sy, sx = start_y + y, start_x + x
                if 0 <= sy < site_h and 0 <= sx < site_w:
                    if site_grid[sy, sx] == EMPTY:
                        site_grid[sy, sx] = v
                        placed_mask[y, x] = True

    for (bx, by, bw, bh, bv) in module_bounds:
        cy, cx = by + bh//2, bx + bw//2
        if 0 <= cy < h and 0 <= cx < w and placed_mask[cy, cx]:
            site_bounds.append((start_x + bx, start_y + by, bw, bh, bv))

def generate_porous_triangular_sequence(max_modules):
    S = 10  
    start_x, start_y = 20, 160 
    coords = [(start_x, start_y)]
    candidates = set()

    voids = []
    num_voids = random.randint(5, 8)
    for _ in range(num_voids):
        vx = random.uniform(50, 140)
        vy = random.uniform(40, 140)
        radius = random.uniform(15, 25)
        if (vx - start_x)**2 + (vy - start_y)**2 > (radius + 20)**2:
            voids.append((vx, vy, radius))

    def is_in_void(x, y):
        for vx, vy, r in voids:
            if (x - vx)**2 + (y - vy)**2 < r**2:
                return True
        return False

    def get_neighbors(x, y):
        return [(x, y-S), (x, y+S), (x-S, y), (x+S, y)]

    def add_neighbors(x, y):
        for nx, ny in get_neighbors(x, y):
            if 20 <= nx <= 160 and 20 <= ny <= 160:
                if (nx, ny) not in coords and not is_in_void(nx, ny):
                    candidates.add((nx, ny))

    add_neighbors(start_x, start_y)
    
    while len(coords) < max_modules:
        if not candidates:
            voids.clear()
            for px, py in coords:
                for nx, ny in get_neighbors(px, py):
                    if 20 <= nx <= 160 and 20 <= ny <= 160:
                        if (nx, ny) not in coords:
                            candidates.add((nx, ny))
            if not candidates:
                break
            
        scored_candidates = []
        for c in candidates:
            dist_from_origin = (c[0] - start_x) + (start_y - c[1])
            score = -dist_from_origin + random.uniform(-15, 15)
            scored_candidates.append((score, c))
            
        scored_candidates.sort(reverse=True, key=lambda item: item[0])
        pool_size = min(len(scored_candidates), 2)
        chosen = random.choice(scored_candidates[:pool_size])[1]
        
        candidates.remove(chosen)
        coords.append(chosen)
        add_neighbors(chosen[0], chosen[1])

    return coords

def build_site_for_stage(coords_subset):
    site_size = 200
    site_grid = np.zeros((site_size, site_size), dtype=int)
    site_bounds = []
    
    module_grid, module_bounds = create_staggered_module()
    
    for x, y in coords_subset:
        stamp_module(site_grid, site_bounds, module_grid, module_bounds, x, y)
        
    return site_grid, site_bounds

# ------------------------------------------------------------------
# Statistics Logic
# ------------------------------------------------------------------
def calculate_and_print_stats(grid, stage):
    studios = np.sum(grid == STUDIO) // 4  
    br1     = np.sum(grid == BR1) // 6     
    br2     = np.sum(grid == BR2) // 8     
    br3     = np.sum(grid == BR3) // 8     
    br4     = np.sum(grid == BR4) // 10    
    cores   = np.sum(grid == STAIRS)
    
    total_units = studios + br1 + br2 + br3 + br4
    
    print(f"--- STAGE {stage} GENERATION STATS ---")
    print(f"Total Vertical Cores: {cores}")
    print(f"Total Residential Units: {total_units}")
    print(f"  - Studios:   {studios}")
    print(f"  - 1-Bedroom: {br1}")
    print(f"  - 2-Bedroom: {br2}")
    print(f"  - 3-Bedroom: {br3}")
    print(f"  - 4-Bedroom: {br4}")
    print("-" * 32 + "\n")

# ------------------------------------------------------------------
# Visualization
# ------------------------------------------------------------------
def _draw_unit_borders(ax, bounds):
    from matplotlib.patches import Rectangle
    for (x, y, w, h, v) in bounds:
        ec = '#CCCCCC' if v in [BR3, BR4] else '#333333'
        if v in [STAIRS, LIFT]:
            ec = '#660000'
            
        lw = 1.0 if v == CORRIDOR else 0.7 
        rect = Rectangle((x - 0.5, y - 0.5), w, h,
                         fill=False, edgecolor=ec, linewidth=lw)
        ax.add_patch(rect)

def plot_growth_stages():
    fig, axes = plt.subplots(1, 4, figsize=(24, 6))
    cmap  = ListedColormap(COLORS)
    bnorm = BoundaryNorm(np.arange(len(COLORS) + 1) - 0.5, cmap.N)
    
    print("\nStarting Procedural Generation...\n" + "="*32)
    
    stages_counts = [1, 15, 45, 110]
    full_sequence = generate_porous_triangular_sequence(stages_counts[-1])
    
    for i in range(4):
        stage = i + 1
        current_coords = full_sequence[:stages_counts[i]]
        
        grid, bounds = build_site_for_stage(current_coords)
        calculate_and_print_stats(grid, stage)
        
        ax = axes[i]
        
        # Apply the tight crop to make Stage 1 appear bigger
        if stage == 1:
            y_idx, x_idx = np.where(grid != EMPTY)
            min_x = np.min(x_idx) - 2
            max_x = np.max(x_idx) + 3
            min_y = np.min(y_idx) - 2
            max_y = np.max(y_idx) + 3
            
            w = max_x - min_x
            h = max_y - min_y
            size = max(w, h)
            
            pad_x = size - w
            pad_y = size - h
            
            min_x = max(0, min_x - pad_x // 2)
            max_x = min_x + size
            min_y = max(0, min_y - pad_y // 2)
            max_y = min_y + size
        else:
            # Fixed wide canvas for the later stages
            min_x, max_x = 10, 190
            min_y, max_y = 10, 190
            
        cropped_grid = grid[min_y:max_y, min_x:max_x]
        cropped_bounds = [(bx - min_x, by - min_y, bw, bh, bv) 
                          for (bx, by, bw, bh, bv) in bounds
                          if min_x <= bx < max_x and min_y <= by < max_y]

        ax.imshow(cropped_grid, cmap=cmap, norm=bnorm, aspect='equal', interpolation='nearest')
        _draw_unit_borders(ax, cropped_bounds)
        
        # Overlay Cluster Text Labels on Stage 1 using the requested style
        if stage == 1:
            bbox_props = dict(boxstyle="square,pad=0.3", fc="#555555", ec="none")
            seed_x, seed_y = current_coords[0]
            cx = (seed_x + 10) - min_x
            cy = (seed_y + 10) - min_y
            
            # Text is placed offset to sit over the staggered wings
            ax.text(cx - 5, cy - 5, 'Prof.', ha='center', va='center', fontsize=10, color='white', bbox=bbox_props)
            ax.text(cx + 5, cy + 5, 'Student', ha='center', va='center', fontsize=10, color='white', bbox=bbox_props)
            ax.text(cx + 5, cy - 5, 'Hybrid', ha='center', va='center', fontsize=10, color='white', bbox=bbox_props)
            ax.text(cx - 5, cy + 5, 'Family', ha='center', va='center', fontsize=10, color='white', bbox=bbox_props)
            
        # Grid layout is completely removed for a clean presentation
        ax.set_xticks([])
        ax.set_yticks([])
        ax.set_title(f'Stage {stage} (Porous Triangular)', fontsize=14, fontweight='bold', pad=10)

    handles = [Patch(facecolor=COLORS[i], edgecolor='#555', label=LABELS[i])
               for i in range(1, len(COLORS))]
    fig.legend(handles=handles, loc='lower center', ncol=6,
               fontsize=11, frameon=False, bbox_to_anchor=(0.5, -0.1))
    
    plt.tight_layout()
    plt.show()

if __name__ == '__main__':
    plot_growth_stages()