# ANCHOR MANUAL - RESIDENTIAL UNITS CATALOG
# This dictionary defines the voxel volume requirements and topological graph rules for the generative algorithm.

residential_catalog = {
    "S1": {
        "name": "Studio",
        "area_m2": 39.0,
        "min_modules": 4.3, # Based on 3x3m voxels
        "required_spaces": ["Entrance", "Storage", "Living_Kitchen_Dining", "Double_Room", "Shower"],
        "central_hub": ["Entrance", "Living_Kitchen_Dining"], # Open plan layout
        "shared_walls": [
            ("Shower", "Double_Room") # Structural Adjacency
        ]
    },
    
    "S2": {
        "name": "1-Bedroom",
        "area_m2": 51.0,
        "min_modules": 5.6,
        "required_spaces": ["Entrance", "Storage", "Hallway", "Living_Kitchen_Dining", "Double_Room", "Shower"],
        "central_hub": ["Hallway"], # Central circulation spine
        "shared_walls": [
            ("Entrance", "Storage"), 
            ("Storage", "Shower"), 
            ("Shower", "Double_Room"), 
            ("Double_Room", "Living_Kitchen_Dining"), 
            ("Living_Kitchen_Dining", "Entrance")
        ] # Forms a structural ring around the hallway
    },
    
    "S3": {
        "name": "2-Bedroom",
        "area_m2": 60.0,
        "min_modules": 6.6,
        "required_spaces": ["Entrance", "Storage", "Hallway", "Living_Kitchen_Dining", "Double_Room_1", "Double_Room_2", "Shower", "Bathroom"],
        "central_hub": ["Hallway"],
        "shared_walls": [
            ("Entrance", "Storage"), 
            ("Storage", "Bathroom"), 
            ("Bathroom", "Double_Room_1"), # Assuming Double Room 1 is Master based on manual
            ("Double_Room_1", "Double_Room_2"), 
            ("Double_Room_2", "Living_Kitchen_Dining")
        ]
    },
    
    "S4": {
        "name": "3-Bedroom",
        "area_m2": 74.0, # Noted as 75m2 in previous manual
        "min_modules": 8.3,
        "required_spaces": ["Entrance", "Storage", "Hallway", "Living_Kitchen_Dining", "Double_Room_1", "Double_Room_2", "Master_Bedroom", "Shower", "Bathroom"],
        "central_hub": ["Living_Kitchen_Dining", "Hallway"], # Transition zone to private quarters
        "shared_walls": [
            ("Living_Kitchen_Dining", "Bathroom"), 
            ("Living_Kitchen_Dining", "Double_Room_2"), 
            ("Bathroom", "Master_Bedroom"), # Ensuite connection
            ("Master_Bedroom", "Double_Room_1"), 
            ("Double_Room_1", "Double_Room_2")
        ]
    },
    
    "S5": {
        "name": "4-Bedroom",
        "area_m2": 90.0,
        "min_modules": 10.0,
        "required_spaces": ["Entrance", "Storage", "Hallway", "Living_Kitchen_Dining", "Double_Room_1", "Double_Room_2", "Double_Room_3", "Single_Room", "Bathroom_1", "Bathroom_2", "Shower"],
        "central_hub": ["Hallway"],
        "shared_walls": [
            ("Bathroom_1", "Single_Room"), 
            ("Single_Room", "Bathroom_2"), 
            ("Bathroom_2", "Living_Kitchen_Dining"), 
            ("Double_Room_1", "Double_Room_2"), 
            ("Double_Room_2", "Double_Room_3"), 
            ("Double_Room_3", "Bathroom_1")
        ]
    }
}

