"""
Void Scanner JSON Parser
Converts void scanner boundary JSON to layout engine format
"""

import json
from typing import Dict, List, Optional, Tuple

class VoidBoundaryParser:
    """Parse void scanner JSON boundary exports"""
    
    @staticmethod
    def parse_void_json(json_data: Dict) -> Dict:
        """
        Extract boundary info from void scanner JSON
        """
        boundary_info = {
            "centroid": json_data.get("boundary", {}).get("centroid"),
            "centroid_latlon": json_data.get("boundary", {}).get("centroid"),
            "boundary_polygon_m": json_data.get("boundary", {}).get("local_polygon_m", []),
            "area_m2": json_data.get("area_m2", 0),
            "grid_cell_size_m": json_data.get("grid", {}).get("cell_size_m", 6),
            "grid_rotation_deg": json_data.get("grid", {}).get("rotation_deg", 0),
        }
        
        # Extract grid lines for visualization
        grid_segments = json_data.get("grid", {}).get("segments", [])
        boundary_info["grid_lines"] = [
            {
                "x1": seg["x1"],
                "y1": seg["y1"],
                "x2": seg["x2"],
                "y2": seg["y2"],
                "level": seg.get("level", "minor")
            }
            for seg in grid_segments
        ]
        
        return boundary_info
    
    @staticmethod
    def convert_meters_to_pixels(
        boundary_polygon_m: List[Dict],
        pixels_per_meter: float = 20.0,
        offset_x: float = 400.0,
        offset_y: float = 300.0
    ) -> List[List[float]]:
        """
        Convert boundary polygon from meters to pixels with an absolute scale.
        """
        if not boundary_polygon_m:
            return []
        
        # Find minimums to normalize the starting point to 0,0
        xs = [pt["x"] for pt in boundary_polygon_m]
        ys = [pt["y"] for pt in boundary_polygon_m]
        
        min_x_m = min(xs)
        min_y_m = min(ys)
        
        # Convert points accurately based on the PIXELS_PER_METER constant
        polygon_pixels = []
        for pt in boundary_polygon_m:
            px = ((pt["x"] - min_x_m) * pixels_per_meter) + offset_x
            py = ((pt["y"] - min_y_m) * pixels_per_meter) + offset_y
            polygon_pixels.append([px, py])
            
        return polygon_pixels
    
    @staticmethod
    def calculate_bounding_box(polygon_pixels: List[List[float]]) -> Dict:
        """
        Calculate axis-aligned bounding box from the strictly scaled polygon.
        """
        if not polygon_pixels:
            return {"minX": 30, "maxX": 770, "minY": 70, "maxY": 570}
        
        xs = [pt[0] for pt in polygon_pixels]
        ys = [pt[1] for pt in polygon_pixels]
        
        return {
            "minX": min(xs),
            "maxX": max(xs),
            "minY": min(ys),
            "maxY": max(ys)
        }
    
    @staticmethod
    def void_json_to_boundary_config(json_data: Dict) -> Dict:
        """
        Complete pipeline: void JSON -> BoundaryConfig
        """
        # Parse void JSON
        boundary_info = VoidBoundaryParser.parse_void_json(json_data)
        
        # Convert to pixels (Strict 20px = 1m scale, shifted slightly into view)
        polygon_pixels = VoidBoundaryParser.convert_meters_to_pixels(
            boundary_info["boundary_polygon_m"],
            pixels_per_meter=20.0,
            offset_x=400.0,
            offset_y=300.0
        )
        
        # Get exact bounding box of the physical pixels
        bbox = VoidBoundaryParser.calculate_bounding_box(polygon_pixels)
        
        # Create boundary config
        boundary_config = {
            "type": "Polygon",
            "minX": bbox["minX"],
            "maxX": bbox["maxX"],
            "minY": bbox["minY"],
            "maxY": bbox["maxY"],
            "name": "Imported Void Boundary",
            "gridSize": 15,
            "unit": "pixels",
            "metadata": {
                "original_area_m2": boundary_info["area_m2"],
                "grid_cell_size_m": boundary_info["grid_cell_size_m"],
                "grid_rotation_deg": boundary_info["grid_rotation_deg"],
                "polygon_pixels": polygon_pixels,
                "grid_lines": boundary_info["grid_lines"]
            }
        }
        
        return boundary_config


# Example usage
if __name__ == "__main__":
    with open("void_boundary_1774090566394.json", "r") as f:
        void_json = json.load(f)
    
    config = VoidBoundaryParser.void_json_to_boundary_config(void_json)
    print(json.dumps(config, indent=2))