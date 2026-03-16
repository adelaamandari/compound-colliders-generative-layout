# ANCHOR MANUAL - ADJACENCY MATRIX (WEIGHTS)
# 0.0 = Forbidden/Repel | 1.0 = Allowed/Neutral | 2.0+ = Encouraged/Required (Attract)

# 1. Complete list of all possible states (Room types + Circulation)
states = [
    "SK", "SL", "GR", "W", "L", "CP", "MR",    # Private Communal
    "MH", "MC", "G", "ER", "IP", "GA", "OP",   # Public Buffer Zone
    "S1", "S2", "S3", "S4", "S5",              # Residential Units (Studio to 4-bed)
    "Corridor", "Core", "Entrance"             # Circulation / Anchors
]

# 2. Initialize a blank matrix with 1.0 
adjacency_matrix = {state_A: {state_B: 1.0 for state_B in states} for state_A in states}

# Helper function to easily apply rules in both directions
def set_weight(room_a, room_b, weight):
    if room_a in adjacency_matrix and room_b in adjacency_matrix:
        adjacency_matrix[room_a][room_b] = weight
        adjacency_matrix[room_b][room_a] = weight

# --- APPLYING THE DESIGN RULE SET CONSTRAINTS ---

residential_units = ["S1", "S2", "S3", "S4", "S5"]

# --- PRIVATE COMMUNAL RULES ---

# Shared Kitchen (SK)
set_weight("SK", "Core", 3.0) # Must touch vertical circulation (MEP service shaft) 

# Shared Living (SL)
set_weight("SL", "SK", 2.0) # Must touch kitchen 
set_weight("SL", "Corridor", 2.0) # Surrounded by corridor 

# Game Room (GR)
for res in residential_units:
    set_weight("GR", res, 0.0) # Acoustic buffer, no face next to bedroom 

# Library (L)
set_weight("L", "GR", 0.0) # Buffer from game room 
set_weight("L", "SL", 0.0) # Buffer from shared living room 

# Meeting Room (MR)
set_weight("MR", "Entrance", 2.0) # Near entrance
set_weight("MR", "Core", 2.0) # Or near core, high exposure


# --- PUBLIC BUFFER ZONE RULES ---

# Multi-purpose Hall (MH)
set_weight("MH", "Entrance", 2.0) # High exposure accessibility, near site entrance 

# Mini Cinema (MC)
set_weight("MC", "Core", 2.0) # Internal placement (middle or core) 

# Gym (G)
for res in residential_units:
    set_weight("G", res, 0.0) # Sound buffer, no face next to bedroom

# Events Room (ER)
set_weight("ER", "GA", 2.0) # Direct access to garden 
set_weight("ER", "MH", 2.0) # Or multi-purpose hall 

# Indoor Play Area (IP)
set_weight("IP", "GA", 2.0) # Visual connected to garden 
set_weight("IP", "OP", 2.0) # Or outdoor playground 


# --- RESIDENTIAL RULES ---

# Entrances MUST be from corridor edges
for res in residential_units:
    set_weight(res, "Corridor", 2.0) # Actively pull residential units to corridors