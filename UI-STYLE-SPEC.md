# LinX — UI Style Spec

A reference for matching the LinX frontend (fonts, colours, text sizes).
The app has **two screens**, each with its own typography + palette:

| Route | File | Screen |
|---|---|---|
| `/` | `frontend/src/App.js` | **Massing Engine** (main tool) |
| `/cluster` | `frontend/src/ClusterApp.js` | **Cluster Multiplication** |

Global base styles live in `frontend/src/index.css`.

---

## Global (applies everywhere) — `index.css`

- **Body font:** `'Jost', 'Century Gothic', 'Avenir Next', sans-serif`
- **Line height:** `1.45`
- **Letter spacing:** `0.2px` (body) / `0.3px` on `button, select, input, label, h1–h4`
- **Smoothing:** `-webkit-font-smoothing: antialiased`
- **Monospace / code:** `source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace`
- `box-sizing: border-box` on everything

---

## 🅐 Massing Engine (`App.js`)

### Fonts
| Use | Family |
|---|---|
| All UI | **Jost** (Google Fonts) → fallback `'Century Gothic', 'Avenir Next', sans-serif` |
| Weights loaded | Jost **300, 400, 500, 600, 700** |

Google Fonts link:
```
https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&display=swap
```

### Colour palette (`COLORS`)
Monochrome greys + white, with a maroon-red accent.

| Token | Hex | Used for |
|---|---|---|
| `bgDark` | `#f1f3f5` | App background |
| `bgMedium` | `#e4e7ea` | Header, sidebars, inputs |
| `bgLight` | `#ffffff` | Cards, panels, light buttons |
| `borderDark` | `#b9bfc5` | Strong borders |
| `borderMedium` | `#d3d8dd` | Standard borders |
| `borderLight` | `#eaedf0` | Subtle borders |
| `textPrimary` | `#23282d` | Main text |
| `textSecondary` | `#5f676e` | Labels, secondary text |
| `textTertiary` | `#969da4` | Muted text |
| `accent` | `#4f1717` | Maroon-red — active buttons, highlights |
| `accentDark` | `#360f0f` | Darker accent |

**Semantic zone / room fills:**
| Zone | Hex |
|---|---|
| Green / garden / playground | `#7d8a6a` |
| Core / lobby | `#9a9690` |
| Residential | `#6e2424` |
| Public / buffer | `#b0746c` |
| Private communal | `#6a665f` |
| Corridor | `#cfccc6` |
| Default / fallback | `#bdbab5` |
| Delete (×) button | `#b86868` |
| "+ Green Areas" text / border | `#5d6a4d` / `#7d8a6a` |

**3D massing materials (OBJ export & 3D view):**
| Category | Hex |
|---|---|
| Residential Unit | `#4DA3FF` |
| Circulation | `#6DB388` |
| Private Communal | `#B89A6D` |
| Public Buffer Zone | `#B86868` |

### Text sizes
| px | Where | Notes |
|---|---|---|
| **24px** | Title "LinX Massing Engine" | weight 400; "LinX" is 700 |
| **16px** | Floor overlay label | |
| **14px** | (legacy / occasional) | |
| **13px** | Section heads ("FLOORS"), panel titles, active-floor label | uppercase, letter-spacing 1px |
| **12px** | **Top toolbar** (Target User, Residents, view tabs, action buttons), floor buttons, export buttons | uppercase, **letter-spacing 0.5px** |
| **11px** | Data analytics, site boundary, daylight, catalog items, badges | |

**Top toolbar convention (the row next to the title):**
> All controls — labels, dropdown, number input, `2D / 3D / Graph` tabs, and the
> Randomize / Auto-Layout / + Green Areas / Import Boundary buttons — share:
> `font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;`
> Buttons use `font-weight: 600`; labels use `500`.

Weights in use: **400** body · **500–600** labels/buttons · **700** headings & "LinX".
Headings typically add `letter-spacing: 1px` + `text-transform: uppercase`.

---

## 🅑 Cluster Multiplication (`ClusterApp.js`)

### Fonts
| Use | Family |
|---|---|
| Body UI | **Barlow** (Google Fonts) → `'Barlow', sans-serif` |
| Brand / headings / canvas titles | **Barlow Condensed** → `'Barlow Condensed', sans-serif` |
| Weights loaded | Barlow **300–700**; Barlow Condensed **500 / 600 / 700** |

Google Fonts link:
```
https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap
```

### Colour palette (design tokens `T`)
Warm beige / stone, with a terracotta accent.

| Token | Hex |
|---|---|
| `bg` | `#f0ede8` |
| `panel` | `#e6e2db` |
| `card` | `#faf9f6` |
| `border` | `#ccc8c0` |
| `borderLight` | `#dedad2` |
| `text` | `#1e1c19` |
| `textSub` | `#6e6a62` |
| `textTiny` | `#a09c94` |
| `accent` | `#8a3a2e` |
| `accentSoft` | `rgba(138,58,46,0.10)` |
| `gridLine` | `rgba(0,0,0,0.05)` |
| `gridMajor` | `rgba(0,0,0,0.10)` |
| `void` | `rgba(0,0,0,0.06)` |

**Algorithm tab colours:** `#7a8a70` · `#7a7080` · `#8a7860` · `#607080`

**Room colours (`RC`)** — muted blue-greys & greens:
| Room | Hex | Room | Hex |
|---|---|---|---|
| core | `#c4bfb8` | living | `#c8d0c0` |
| stairs | `#b0a8a0` | garden | `#b4c4b0` |
| corridor | `#d4cfc8` | gym | `#c4b8b8` |
| studio | `#b8c4cc` | library | `#c8c0b0` |
| bed1 | `#a8b8c4` | workspace | `#c0beb4` |
| bed2 | `#98a8b8` | meeting | `#bcc4b8` |
| bed3 | `#8898ac` | play | `#c8bcb4` |
| bed4 | `#7888a0` | mhall | `#b8b4c4` |
| kitchen | `#b8c4b4` | cinema | `#c0b8c4` |
| lift | `#9a3a30` | communal | `#d4aca8` |

### Text sizes
| px | Where | Notes |
|---|---|---|
| **22px** | "LinX" brand | Barlow Condensed, 700, letter-spacing 2px |
| **15px** | Inspector cluster name | |
| **14px** | Card titles, cluster names, slider value | |
| **13px** | Buttons, labels, inputs, footer stats, detail rows | |
| **12px** | Descriptions, legend, footer, distribution counts | |
| **11px** | Section labels, badges, hints | uppercase, letter-spacing 1.5px |

---

## Quick CSS variables (copy-paste starter)

```css
:root {
  /* Massing Engine */
  --bg-dark: #f1f3f5;
  --bg-medium: #e4e7ea;
  --bg-light: #ffffff;
  --border-dark: #b9bfc5;
  --border-medium: #d3d8dd;
  --border-light: #eaedf0;
  --text-primary: #23282d;
  --text-secondary: #5f676e;
  --text-tertiary: #969da4;
  --accent: #4f1717;
  --accent-dark: #360f0f;

  /* Cluster view */
  --c-bg: #f0ede8;
  --c-panel: #e6e2db;
  --c-card: #faf9f6;
  --c-border: #ccc8c0;
  --c-text: #1e1c19;
  --c-text-sub: #6e6a62;
  --c-text-tiny: #a09c94;
  --c-accent: #8a3a2e;

  --font-ui: 'Jost', 'Century Gothic', 'Avenir Next', sans-serif;
  --font-cluster: 'Barlow', sans-serif;
  --font-cluster-head: 'Barlow Condensed', sans-serif;
}
```
