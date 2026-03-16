# ANCHOR MANUAL - COMMUNAL AREA CATALOG
# This dictionary stores all topological and constraint data for the WFC algorithm.

communal_catalog = {
    "MH": {
        "name": "Multi-purpose Hall",
        "height_voxels": 2, # Requires double-height module
        "facade_rule": "none_specified", 
        "placement": "near_entrance", # Near car park or site entrance
        "adjacency_require": [],
        "adjacency_avoid": []
    },
    
    "SL": {
        "name": "Shared Living",
        "height_voxels": 1, 
        "facade_rule": "0_faces_outside", # Can be treated as internal core area
        "placement": "internal_core",
        "adjacency_require": ["SK"], # Must touch kitchen, surrounded by corridor
        "adjacency_avoid": []
    },
    
    "G": {
        "name": "Gym",
        "height_voxels": 1,
        "facade_rule": "facade_needed", # High ventilation, facade needed
        "placement": "any",
        "adjacency_require": [],
        "adjacency_avoid": ["bedroom"] # Sound buffer, no face next to bedroom
    },
    
    "ER": {
        "name": "Events Room",
        "height_voxels": 1,
        "facade_rule": "1_face_north_south",
        "placement": "lower_ground", # Lower ground placement
        "adjacency_require": ["GA", "MH"], # Direct access to garden or multi-purpose hall
        "adjacency_avoid": []
    },
    
    "SK": {
        "name": "Shared Kitchen",
        "height_voxels": 1,
        "facade_rule": "1_service_face_mep", # Must have 1 service face (MEP)
        "placement": "stacked", # Needs to align when stacked for service shaft
        "adjacency_require": ["vertical_circulation"], # Must touch vertical circulation
        "adjacency_avoid": []
    },
    
    "GR": {
        "name": "Game Room",
        "height_voxels": 1,
        "facade_rule": "none_specified",
        "placement": "any",
        "adjacency_require": [],
        "adjacency_avoid": ["residential"] # 10m ideally from nearest residential
    }
}


