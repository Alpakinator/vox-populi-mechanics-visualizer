---
description: 'Project-specific coding standards for VP Mechanics Visualizer'
applyTo: '**/*.svelte, **/*.ts'
---

# Project Patterns - Coding Standards

Project-specific conventions for the VP Mechanics Visualizer codebase.

## Import Conventions

Always use `$lib/` alias:

```typescript
// CORRECT
import { Unit } from '$lib/types/civilopedia';
import { createThrottle } from '$lib/utils/throttle';

// WRONG
import { Unit } from '../lib/types/civilopedia';
```

## Data Access Pattern

```typescript
import civilopediaData from '$lib/data/civilopedia_export.json';
import type { Unit } from '$lib/types/civilopedia';

const units = (civilopediaData as { units: Unit[] }).units;
```

## Formula Usage

```typescript
import { getUnitPurchaseCost } from '$lib/formulas/gold-purchase';
import { createDefaultGameContext } from '$lib/types/game-context';

const ctx = createDefaultGameContext();
const goldCost = getUnitPurchaseCost(productionCost, ctx);
```

## Svelte 5 Runes

Use only Svelte 5 runes for reactivity:

```typescript
let value = $state(0);
const computed = $derived(expensiveCalc(value));

$effect(() => {
  // Side effects here
});
```

## Component Naming

- One component per file
- Descriptive PascalCase names: `UnitCostGraph.svelte`, `EraSelector.svelte`
- Graph components go in `src/lib/components/graphs/`

## Asset Paths

```typescript
// Icons from game assets
const iconPath = '/civ5_assets/base_ui_png/icon.png';

// Use IconAtlas + PortraitIndex from civilopedia data for sprites
```

## For Task-Specific Workflows

- **Querying game data**: See `data-query` skill
- **Creating graphs**: See `plotly-graph` skill  
- **Translating formulas**: See `formula-translator` skill
