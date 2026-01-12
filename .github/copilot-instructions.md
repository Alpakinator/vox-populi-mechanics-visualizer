# Vox Populi Mechanics Visualizer - Copilot Instructions

## Project Overview

A static SvelteKit website for visualizing Civilization 5 Vox Populi mod mechanics through interactive Plotly.js graphs. Designed for Vox Populi developers to analyze and adjust game balance (units, buildings, formulas).

**Important**: Vox Populi is a total conversion mod that replaces Civ 5's core DLL with its own (`CvGameCoreDLL_Expansion2`). This DLL contains all game logic, AI behavior, and formulas. While VP builds on Civ 5's foundation, the C++ source code we reference is VP's implementation, which often differs significantly from vanilla Civ 5.

Agents must never attempt to use MCP servers.

## Architecture

- **Framework**: SvelteKit with adapter-static (no SSR, pure client-side)
- **Graphing**: Plotly.js for interactive 2D graphs with slider controls
- **Data Source**: `src/lib/data/civilopedia_export.json` (55,998 lines, comprehensive game database)
- **Styling**: Custom font `src/lib/fonts/Tw Cen MT.ttf`, Civ5 UI assets in `static/civ5_assets/`
- **Language**: TypeScript strict mode, Svelte 5 runes

## Project Structure

```
src/
├── lib/
│   ├── data/
│   │   └── civilopedia_export.json   # Main game database
│   ├── types/
│   │   ├── civilopedia.ts            # Entity interfaces (Unit, Building, Tech...)
│   │   └── game-context.ts           # Game parameters (speed, era, handicap)
│   ├── formulas/                     # Translated C++ formulas as TypeScript
│   ├── components/                   # Reusable Svelte components
│   │   └── graphs/                   # Plotly graph components
│   ├── utils/                        # Data processing utilities
│   └── fonts/
│       └── Tw Cen MT.ttf
├── routes/                           # SvelteKit pages
static/
└── civ5_assets/
    ├── base_ui_png/                  # Base game icons
    ├── exp1_ui_png/                  # Gods & Kings icons
    └── exp2_ui_png/                  # Brave New World icons
```


## Key Data Entities in civilopedia_export.json

| Key | Description | Key Fields |
|-----|-------------|------------|
| `units` | Military/civilian units | Type, Name, EraID, Combat, Domain, Help (contains costs) |
| `buildings` | City buildings | Type, Name, Cost, Maintenance, YieldChanges, PrereqTech |
| `technologies` | Tech tree | Type, Name, EraID, Cost, GridX/Y, UnlockedUnits/Buildings |
| `promotions` | Unit abilities | Type, Name, RequiredPromotions, LeadsToPromotions |
| `wonders` | World/National wonders | Type, Name, Cost, YieldChanges, PrereqTech |
| `policies` | Social policies | Branch, prerequisites, yields |
| `beliefs` | Religious beliefs | Type, bonuses, requirements |

**Note**: Unit costs are embedded in the `Help` text field. Use `parseCostFromHelp()` from `$lib/utils/civilopedia-parser` to extract them.

## C++ Source Reference

The folder `CvGameCoreDLL_Expansion2/` (gitignored, externally linked) contains Vox Populi DLL source code for formula reference. Key patterns:

- **Constants**: `GD_INT_GET(CONSTANT_NAME)`, `GD_FLOAT_GET(CONSTANT_NAME)`
- **Game context**: `GC.getGame()`, `GC.getMap()`, player/city accessors
- **Modifier pattern**: `value *= (100 + modifier); value /= 100;`

## Performance Requirements

- **No stutters**: Graphs must update at 60fps during slider manipulation
- **2D matrix precomputation**: When a slider moves, compute the full parameter sweep
- **3D limit**: No precomputation for 2+ sliders simultaneously (compute on demand)
- **Throttling**: Use 16ms throttle for slider-driven updates
- **Efficient updates**: Use `Plotly.react()` not `Plotly.newPlot()` for updates

## Coding Conventions

1. **Imports**: Always use `$lib/` alias for src/lib paths
2. **Reactivity**: Svelte 5 runes only (`$state`, `$derived`, `$effect`)
3. **Types**: Define interfaces in `src/lib/types/`, export from `src/lib/index.ts`
4. **Formulas**: Each C++ formula translation goes in `src/lib/formulas/` with JSDoc explaining original
5. **Components**: One component per file, named descriptively (e.g., `UnitCostGraph.svelte`)

## Graph Component Pattern

```svelte
<script lang="ts">
  import Plotly from 'plotly.js-dist';
  import { createThrottle } from '$lib/utils/throttle';
  
  let sliderValue = $state(50);
  let plotDiv: HTMLDivElement;
  let initialized = false;
  
  const throttledUpdate = createThrottle(() => {
    const data = computeData(sliderValue); // 2D matrix computation
    Plotly.react(plotDiv, data.traces, data.layout);
  }, 16);
  
  // Initial render
  $effect(() => {
    if (plotDiv && !initialized) {
      initialized = true;
      const data = computeData(sliderValue);
      Plotly.newPlot(plotDiv, data.traces, data.layout, { responsive: true });
    }
  });
  
  // Update on slider change
  $effect(() => {
    if (!initialized) return;
    sliderValue; // track dependency
    throttledUpdate();
  });
</script>
```

## Asset Usage

- **Icons**: Reference via `/civ5_assets/{base|exp1|exp2}_ui_png/` paths
- **Font**: Load Tw Cen MT via CSS `@font-face` from `$lib/fonts/`
- **Entity icons**: Use `IconAtlas` + `PortraitIndex` from civilopedia data to locate sprites

