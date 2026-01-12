---
description: 'C++ to TypeScript translation conventions for Vox Populi formulas'
applyTo: '**/*.ts, **/formulas/**'
---

# C++ to TypeScript Translation Conventions

Code standards for TypeScript formula files translated from Vox Populi C++ source.

## About the Source Code

Vox Populi is a total conversion mod that **replaces** Civ 5's core DLL entirely. The C++ source in `CvGameCoreDLL_Expansion2/` (gitignored, externally linked) is VP's own implementation—not vanilla Civ 5.

## Required Code Patterns

### Integer Math Preservation

C++ uses integer division which truncates toward zero. **Always** preserve this:

```typescript
// CORRECT
const result = Math.floor((value * modifier) / 100);

// WRONG - floating point
const result = (value * modifier) / 100;
```

### Modifier Application

Use the shared helper for the standard modifier pattern:

```typescript
import { applyModifier } from '$lib/formulas/modifiers';

let cost = baseCost;
cost = applyModifier(cost, instanceCostModifier);
cost = applyModifier(cost, eraCostModifier);
```

### Min/Max Clamping

```typescript
return Math.max(1, value);
return Math.min(100, Math.max(0, value));
```

## Documentation Requirements

Every formula function requires JSDoc with:

```typescript
/**
 * Brief description.
 *
 * @source CvFile.cpp:lineNumber - ClassName::functionName()
 *
 * @constants
 * - CONSTANT_NAME: defaultValue (GD_INT_GET)
 *
 * @param paramName - Description
 * @returns What this returns
 */
```

## File Organization

Existing formula files:
```
src/lib/formulas/
├── index.ts          # Re-exports all formulas
├── gold-purchase.ts  # Gold costs and purchase prices
└── modifiers.ts      # Shared modifier utilities
```

New files should follow naming convention (e.g., `growth.ts`, `combat.ts`) and be exported from `index.ts`.

## For Step-by-Step Translation Workflow

See the `formula-translator` skill for detailed translation workflows with examples.
