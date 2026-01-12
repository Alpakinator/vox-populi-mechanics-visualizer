---
name: formula-translator
description: Translate Civilization 5 Vox Populi C++ formulas to TypeScript. Use when asked to translate a formula, add a new mechanic calculation, convert C++ code from CvGameCoreDLL, implement game logic like production costs, gold costs, growth thresholds, combat calculations, or yield computations. Handles GD_INT_GET/GD_FLOAT_GET macros, integer math preservation, and modifier chains.
---

# VP Formula Translator

Translates Vox Populi DLL C++ formulas to TypeScript while preserving game logic semantics.

## When to Use This Skill

- Translating a specific C++ formula from `CvGameCoreDLL_Expansion2/`
- Adding a new mechanic calculation (production, gold, growth, combat, yields)
- Implementing game logic that references VP source code
- Converting `GD_INT_GET` / `GD_FLOAT_GET` macros to TypeScript constants
- Preserving integer math behavior from C++

## Source Code Location

The C++ source is in `CvGameCoreDLL_Expansion2/` (externally linked, gitignored). Key files:

| File | Contains |
|------|----------|
| `CvPlayer.cpp` | Player-level calculations (production, gold, growth thresholds) |
| `CvCity.cpp` | City-level calculations (yields, purchases, food) |
| `CvUnit.cpp` | Unit calculations (combat, movement, costs) |
| `CvPlot.cpp` | Tile yield calculations |
| `CustomMods.h` | MOD flag definitions |

## Step-by-Step Workflow

### 1. Locate the C++ Function

Search for the formula in the DLL source:
```bash
grep -rn "FunctionName" CvGameCoreDLL_Expansion2/
```

### 2. Extract Dependencies

Identify in the C++ function:
- All `GD_INT_GET()` / `GD_FLOAT_GET()` constants with their default values
- Game context accessors (`GC.getGame().getGameSpeedInfo()`, etc.)
- Other function calls that need translation
- MOD flags that change behavior

### 3. Translate Using These Patterns

**Macro Translation:**
```cpp
// C++
int iBase = /*15*/ GD_INT_GET(BASE_CITY_GROWTH_THRESHOLD);
float fExp = /*2.22f*/ GD_FLOAT_GET(CITY_GROWTH_EXPONENT);
```
```typescript
// TypeScript
const BASE_CITY_GROWTH_THRESHOLD = 15;  // GD_INT_GET default
const CITY_GROWTH_EXPONENT = 2.22;      // GD_FLOAT_GET default (VP value)
```

**Integer Division (CRITICAL):**
```cpp
// C++ - truncates toward zero
int result = value * modifier / 100;
```
```typescript
// TypeScript - MUST use Math.floor
const result = Math.floor((value * modifier) / 100);
```

**Modifier Chain Pattern:**
```cpp
// C++
iValue *= (100 + iModifier);
iValue /= 100;
```
```typescript
// TypeScript - use helper from $lib/formulas/modifiers.ts
import { applyModifier } from '$lib/formulas/modifiers';
const value = applyModifier(baseValue, modifier);
```

**Game Context Accessors:**
```cpp
// C++
GC.getGame().getGameSpeedInfo().getGrowthPercent()
```
```typescript
// TypeScript
import type { GameContext } from '$lib/types/game-context';
const modifier = ctx.gameSpeed.growthPercent;
```

### 4. Add JSDoc Documentation

Every translated formula requires:

```typescript
/**
 * Brief description of what this calculates.
 *
 * @source CvPlayer.cpp:44569 - CvPlayer::getGrowthThreshold()
 *
 * @constants
 * - CONSTANT_NAME: defaultValue (GD_INT_GET)
 * - ANOTHER_CONSTANT: defaultValue (GD_FLOAT_GET, VP value)
 *
 * @param paramName - Parameter description
 * @param ctx - Game context (speed, era, handicap modifiers)
 * @returns What this function returns
 */
```

### 5. Place in Correct File

Existing formula files:
```
src/lib/formulas/
├── index.ts          # Re-exports all formulas
├── gold-purchase.ts  # Gold costs and purchase prices
└── modifiers.ts      # Shared modifier application utilities
```

New formula files should follow naming convention and be added to index.ts:
- `growth.ts` - Population/food formulas
- `production.ts` - Unit/building production costs  
- `combat.ts` - Combat strength calculations
- `yields.ts` - Tile and building yield formulas

### 6. Export from Index

Add to `src/lib/formulas/index.ts`:
```typescript
export { yourNewFunction } from './your-file';
```

## Common Patterns Reference

### Min/Max Clamping
```cpp
return std::max(1, iValue);
return std::min(100, std::max(0, iValue));
```
```typescript
return Math.max(1, value);
return Math.min(100, Math.max(0, value));
```

### Production Cost with Scaling

**Note**: Unit costs are embedded in the `Help` text field, not a direct property.
Use `parseCostFromHelp()` from `$lib/utils/civilopedia-parser` to extract them.

```typescript
import { parseCostFromHelp } from '$lib/utils/civilopedia-parser';

// Extract base cost from Help text
const costs = parseCostFromHelp(unit.Help);
const baseCost = costs?.production ?? 0;

// Apply game speed modifier
let cost = Math.floor((baseCost * ctx.gameSpeed.trainPercent) / 100);

return Math.max(1, cost);
```

### Tech Progress Modifier

Many VP formulas scale costs by tech progress (`iTechProgress = techsKnown * 100 / totalTechs`):

```cpp
// C++ pattern (CvCity.cpp)
int iTechProgress = (GetTeamTechs()->GetNumTechsKnown() * 100) / GC.getNumTechInfos();
iTechProgress /= 2;  // Units use /2, buildings use /3
iCost *= 100 + iTechProgress;
iCost /= 100;
```

```typescript
// TypeScript - use tech-progress utilities
import { getGridXFromPrereqTech, getEstimatedTechProgressAtGridX } from '$lib/utils/tech-progress';

// For units: get actual GridX from prereq tech (NOT from production cost!)
const gridX = getGridXFromPrereqTech(techData, unit.PrereqTech);
const techProgress = getEstimatedTechProgressAtGridX(techData, gridX);

// Apply modifier (units = /2, buildings = /3)
const techMod = Math.floor(techProgress / 2);
cost = Math.floor((cost * (100 + techMod)) / 100);
```

**Key insight**: Unit production costs don't map to GridX like buildings. Always use `PrereqTech.Type` to get accurate tech position.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Output differs from in-game | Check integer division - use `Math.floor()` |
| Missing constant value | Search for `/*default*/` comment before `GD_*_GET` |
| MOD-specific behavior | Check `CustomMods.h` for flag definitions |
| Floating point drift | VP uses integer math internally - convert appropriately |
| Wrong tech count for unit | Use `PrereqTech.Type` → GridX, not production cost |

## References

See the actual source files:
- Modifiers: `src/lib/formulas/modifiers.ts`
- Game context: `src/lib/types/game-context.ts`
- Gold purchase example: `src/lib/formulas/gold-purchase.ts`
