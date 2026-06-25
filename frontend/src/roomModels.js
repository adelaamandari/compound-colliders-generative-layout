// ============================================================
// ROOM MODEL REGISTRY  (Rhino -> GLB furnished models)
// ============================================================
// One entry per room TYPE, holding an array indexed by catalog VARIANT
// (0 = "Layout A", 1 = "Layout B"). The key is the type name as it appears AFTER
// the " - " in a room category, e.g. "Residential Unit - Studio" -> "Studio".
//
// Each model entry:
//   url    : path under frontend/public/models/ (served at /models/..)
//   size   : [width_m, depth_m] — the model's REAL footprint in metres (centred GLB),
//            so the room is sized to it and the GLB fits 1:1 with no stretching.
//   height : storey height in metres.
//   yaw    : extra rotation in RADIANS to correct facing (optional).
//   yOffset: vertical nudge in metres if it floats/sinks (optional).
//
// Models are exported from Rhino, then centred (base on ground, footprint on origin)
// and compressed (textures -> WebP @1024, geometry -> Draco) into public/models/.

export const ROOM_MODELS = {
  "Studio": [
    { url: "/models/studio-a.glb", size: [10.6, 5.85], height: 3.2 },  // Layout A
    { url: "/models/studio-b.glb", size: [6.6, 9.05],  height: 3.4 },  // Layout B
  ],
  "1 Bedroom": [
    { url: "/models/1bed-a.glb",   size: [9.45, 7.85], height: 3.4 },
    { url: "/models/1bed-b.glb",   size: [8.63, 7.95], height: 3.2 },
  ],
  "2 Bedroom": [
    { url: "/models/2bed-a.glb",   size: [11.45, 7.85], height: 3.2 },
    { url: "/models/2bed-b.glb",   size: [10.8, 7.85],  height: 3.2 },
  ],
  "3 Bedroom": [
    { url: "/models/3bed-a.glb",   size: [10.05, 6.85], height: 6.3 },
  ],
  "4 Bedroom": [
    { url: "/models/4bed-a.glb",   size: [11.45, 7.85], height: 6.2 },
  ],
};

// Look up the model for a full room category + catalog variant. Falls back to the
// type's variant 0 only for the default (variant undefined); an explicitly-requested
// variant with no model returns null (renders as a plain box).
export const getRoomModel = (category, variant) => {
  const list = ROOM_MODELS[(category || "").split(" - ")[1]];
  if (!list) return null;
  if (variant === undefined || variant === null) return list[0] || null;
  return list[variant] || null;
};

// URLs to preload (every registered variant).
export const MODEL_URLS = Object.values(ROOM_MODELS).flat().map((m) => m.url);
