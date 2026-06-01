#!/usr/bin/env python3
"""
Procedural Building Layout Generator
=====================================================================
Generates an initial cross-shaped cluster layout 
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
    '#E0E0E0',  # 1 Communal (Light Gray)
    '#FF3333',  # 2 Stairs (Bright Red)
    '#990000',  # 3 Lift (Dark Red)
    '#D9D9D9',  # 4 Studio
    '#BFBFBF',  # 5 1 Bedroom
    '#A6A6A6',  # 6 2 Bedroom
    '#8C8C8C',  # 7 3 Bedroom
    '#595959',  # 8 4 Bedroom
    '#F2F2F2',  # 9 Buffer Zone
    '#737373',  # 10 Public CA
    '#FFFFFF',  # 11 Corridor
]

# Highly descriptive labels linking unit types to cluster archetypes
LABELS = [
    'Empty', 
    'Private Communal', 
    'Stairs (Core)', 
    'Lift (Core)',
    'Studio (Prof.)', 
    '1 Bed (Family)', 
    '2 Bed (Hybrid/Prof.)', 
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
# Seed Creation & Tessellation
# ------------------------------------------------------------------
def create_cross_module():
    grid = np.zeros((36, 36), dtype=int)
    bounds = []
    
    add_core(grid, 14, 17, bounds) 
    add_core(grid, 20, 17, bounds) 
    add_core(grid, 17, 14, bounds) 
    add_core(grid, 17, 20, bounds) 
    
    for y in range(16, 20):
        for x in range(16, 20):
            place_block(grid, CORRIDOR, x, y, 1, 1, bounds)

    fill_professional(grid, 2, 14, 14, 8, bounds)  
    fill_student(grid, 20, 14, 14, 8, bounds)      
    fill_hybrid(grid, 14, 2, 8, 14, bounds)        
    fill_family(grid, 14, 20, 8, 14, bounds)       
    
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

def generate_multiplied_layout(stage):
    site_size = 140
    site_grid = np.zeros((site_size, site_size), dtype=int)
    site_bounds = []
    
    module_grid, module_bounds = create_cross_module()
    
    cx = site_size // 2 - 18
    cy = site_size // 2 - 18
    S = 18 
    
    coords = []
    radius = stage - 1
    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            if abs(dx) + abs(dy) <= radius:
                coords.append((cx + dx * S, cy + dy * S))
                
    for x, y in coords:
        stamp_module(site_grid, site_bounds, module_grid, module_bounds, x, y)
        
    # Return coords as well so we can place labels precisely
    return site_grid, site_bounds, coords

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
    
    for i in range(4):
        stage = i + 1
        grid, bounds, coords = generate_multiplied_layout(stage=stage)
        
        calculate_and_print_stats(grid, stage)
        
        ax = axes[i]
        
        y_idx, x_idx = np.where(grid != EMPTY)
        if len(y_idx) > 0:
            min_x, max_x = max(0, np.min(x_idx) - 4), min(grid.shape[1], np.max(x_idx) + 4)
            min_y, max_y = max(0, np.min(y_idx) - 4), min(grid.shape[0], np.max(y_idx) + 4)
            cropped_grid = grid[min_y:max_y, min_x:max_x]
            cropped_bounds = [(bx - min_x, by - min_y, bw, bh, bv) 
                              for (bx, by, bw, bh, bv) in bounds]
        else:
            cropped_grid = grid
            cropped_bounds = bounds
            min_x, min_y = 0, 0

        ax.imshow(cropped_grid, cmap=cmap, norm=bnorm, aspect='equal', interpolation='nearest')
        _draw_unit_borders(ax, cropped_bounds)
        
        # Overlay Cluster Text Labels on the Grid
        # Kept to Stages 1 & 2 to prevent text from overlapping in larger stages
        if stage <= 2:
            bbox_props = dict(boxstyle="round,pad=0.3", fc="black", ec="none", alpha=0.6)
            for (mx, my) in coords:
                # mx, my are the top-left of the 36x36 module block
                # Adjust to find the center of the block, then subtract cropping offset
                cx = (mx + 18) - min_x
                cy = (my + 18) - min_y
                
                # Label the four cluster wings
                ax.text(cx - 10, cy, 'Prof.', ha='center', va='center', fontsize=8, color='white', bbox=bbox_props)
                ax.text(cx + 10, cy, 'Student', ha='center', va='center', fontsize=8, color='white', bbox=bbox_props)
                ax.text(cx, cy - 10, 'Hybrid', ha='center', va='center', fontsize=8, color='white', bbox=bbox_props)
                ax.text(cx, cy + 10, 'Family', ha='center', va='center', fontsize=8, color='white', bbox=bbox_props)
        
        ax.set_xticks([])
        ax.set_yticks([])
        ax.set_title(f'Multiplication Stage {stage}', fontsize=14, fontweight='bold', pad=10)

    # Descriptive bottom legend using the updated LABELS array
    handles = [Patch(facecolor=COLORS[i], edgecolor='#555', label=LABELS[i])
               for i in range(1, len(COLORS))]
    fig.legend(handles=handles, loc='lower center', ncol=6,
               fontsize=11, frameon=False, bbox_to_anchor=(0.5, -0.1))
    
    plt.tight_layout()
    plt.show()

if __name__ == '__main__':
    plot_growth_stages()