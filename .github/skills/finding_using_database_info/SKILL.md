---
name: finding, using database info
description: Query and filter game entities from civilopedia_export.json. Use when asked to find units, buildings, technologies, promotions, wonders, policies, or beliefs. Handles filtering by era, unit class, domain, unique units, barbarians, and extracting costs from help text. Also covers unit upgrade lines and class references. 
---

# Civilopedia Data Query

Query game entities from the civilopedia database for visualization and analysis.

## When to Use This Skill

- Finding specific units, buildings, or technologies
- Filtering entities by era, class, domain, or other properties
- Identifying unique (civilization-specific) units
- Extracting production/gold costs from entity help text
- Looking up unit upgrade lines or class relationships
- Querying any game data for graph visualizations

## Data Source

The main database is `src/lib/data/civilopedia_export.json` (55,998 lines). Import and type it:

```typescript
import civilopediaData from '$lib/data/civilopedia_export.json';
import type { Unit, Building, Technology } from '$lib/types/civilopedia';

const units = (civilopediaData as { units: Unit[] }).units;
const buildings = (civilopediaData as { buildings: Building[] }).buildings;
const technologies = (civilopediaData as { technologies: Technology[] }).technologies;
```

## Available Entity Types

| Key | Description | Key Fields |
|-----|-------------|------------|
| `units` | Military/civilian units | Type, Name, EraID, Combat, Cost, Domain, PrereqTech |
| `buildings` | City buildings | Type, Name, Cost, Maintenance, YieldChanges, PrereqTech |
| `technologies` | Tech tree | Type, Name, EraID, Cost, GridX/Y, UnlockedUnits/Buildings |
| `promotions` | Unit abilities | Type, Name, RequiredPromotions, LeadsToPromotions |
| `wonders` | World/National wonders | Type, Name, Cost, YieldChanges, PrereqTech |
| `policies` | Social policies | Branch, prerequisites, yields |
| `beliefs` | Religious beliefs | Type, bonuses, requirements |

## Common Query Patterns

### Filter by Unit Class

```typescript
const MELEE_CLASSES = [
  'UNITCLASS_WARRIOR', 'UNITCLASS_SWORDSMAN', 'UNITCLASS_LONGSWORDSMAN',
  'UNITCLASS_TERCIO', 'UNITCLASS_INFANTRY', 'UNITCLASS_MECHANIZED_INFANTRY'
];

const meleeUnits = units.filter(u => MELEE_CLASSES.includes(u.Class));
```

### Identify Unique Units (Civ-Specific)

```typescript
const isUnique = (unit: Unit) => unit.Replaces && Object.keys(unit.Replaces).length > 0;

const uniqueUnits = units.filter(isUnique);
const standardUnits = units.filter(u => !isUnique(u));
```

### Exclude Barbarian Units

```typescript
const isBarbarian = (unit: Unit) => unit.Name.includes('Barbarian');

const nonBarbarianUnits = units.filter(u => !isBarbarian(u));
```

### Filter by Era

```typescript
// EraID: 0=Ancient, 1=Classical, 2=Medieval, 3=Renaissance, 4=Industrial, 5=Modern, 6=Atomic, 7=Information
const medievalUnits = units.filter(u => u.EraID === 2);
```

### Filter by Domain

```typescript
// Domain: DOMAIN_LAND, DOMAIN_SEA, DOMAIN_AIR
const navalUnits = units.filter(u => u.Domain === 'DOMAIN_SEA');
```

## Extracting Costs from Help Text

Production and gold costs are embedded in the Help field. Use the parser:

```typescript
import { parseCostFromHelp, stripColorTags } from '$lib/utils/civilopedia-parser';

const unit = units.find(u => u.Type === 'UNIT_WARRIOR');
const costs = parseCostFromHelp(unit.Help);
// Returns: { production: number, gold: number } | undefined

const cleanName = stripColorTags(unit.Name);
// Removes [COLOR_POSITIVE_TEXT] and similar tags
```

## Unit Class Reference

### Common Upgrade Lines

| Line | Unit Classes (in order) |
|------|------------------------|
| **Melee** | WARRIOR → SWORDSMAN → LONGSWORDSMAN → TERCIO → INFANTRY → MECHANIZED_INFANTRY |
| **Ranged** | ARCHER → COMPOSITE_BOWMAN → CROSSBOWMAN → LONGBOWMAN → GATLINGGUN → MACHINE_GUN |
| **Mounted** | HORSEMAN → KNIGHT → LANCER → CAVALRY → TANK → MODERN_ARMOR |
| **Siege** | CATAPULT → TREBUCHET → CANNON → ARTILLERY → ROCKET_ARTILLERY |
| **Naval Melee** | TRIREME → CARAVEL → IRONCLAD → DESTROYER |
| **Naval Ranged** | GALLEASS → FRIGATE → BATTLESHIP → MISSILE_CRUISER |

### Getting All Units in an Upgrade Line

```typescript
function getUpgradeLine(classes: string[]): Unit[] {
  return classes
    .map(cls => units.find(u => u.Class === cls && !isUnique(u)))
    .filter((u): u is Unit => u !== undefined);
}

const meleeLine = getUpgradeLine(MELEE_CLASSES);
```

## Type Definitions

Key interfaces from `src/lib/types/civilopedia.ts` (simplified - see source for full types):

```typescript
interface Unit {
  Type: string;           // UNIT_WARRIOR
  Name: string;           // Warrior (may have color tags)
  Class: string;          // UNITCLASS_WARRIOR
  Combat: number;         // Base combat strength
  RangedCombat?: number;  // Ranged strength (undefined if melee)
  Moves: number;          // Movement points
  Domain: 'DOMAIN_LAND' | 'DOMAIN_SEA' | 'DOMAIN_AIR';
  EraID: number;          // Tech era (0-7)
  PrereqTech?: TechReference;  // { Type, Name } or undefined
  Help: string;           // Full description - extract costs with parseCostFromHelp()
  Replaces: Array<EntityReference> | {};  // Empty object if not unique
}

interface Building {
  Type: string;
  Name: string;
  Cost: number;
  Maintenance: number;
  YieldChanges: YieldChange[] | {};  // Array of { YieldType, Yield, YieldName }
  PrereqTech?: TechReference;
  Help: string;
}

interface Technology {
  Type: string;
  Name: string;
  EraID: number;
  Cost: number;
  GridX: number;          // Position in tech tree
  GridY: number;
  UnlockedUnits: EntityReference[] | {};   // Array of { Type, Name }
  UnlockedBuildings: EntityReference[] | {};
}
```

**Note**: Many array fields use `| {}` (empty object) instead of empty arrays in the JSON.

## Example: Query for Graph Data

```typescript
// Get all standard land combat units for a cost comparison graph
const combatUnits = units.filter(u =>
  u.Domain === 'DOMAIN_LAND' &&
  u.Combat > 0 &&
  !isUnique(u) &&
  !isBarbarian(u)
);

// Sort by era then combat strength
combatUnits.sort((a, b) => {
  if (a.EraID !== b.EraID) return a.EraID - b.EraID;
  return a.Combat - b.Combat;
});

// Extract data for Plotly (note: costs from Help text)
import { parseCostFromHelp, stripColorTags } from '$lib/utils/civilopedia-parser';

const graphData = combatUnits.map(u => {
  const costs = parseCostFromHelp(u.Help);
  return {
    name: stripColorTags(u.Name),
    era: u.EraID,
    combat: u.Combat,
    productionCost: costs?.production ?? 0
  };
});
```

## Tech Progress & GridX Mapping

The tech tree has **82 technologies** across **GridX 0-18**. Use `$lib/utils/tech-progress` for mappings.

### GridX to Cumulative Tech Count

| GridX | Era | Cumulative Techs |
|-------|-----|------------------|
| 0 | Ancient | 1 |
| 5 | Medieval | 27 |
| 7 | Renaissance | 36 |
| 9 | Industrial | 45 |
| 12 | Modern | 59 |
| 16 | Information | 77 |
| 18 | Future | 82 |

### Get Accurate Tech Count for Units

**IMPORTANT**: Use `unit.PrereqTech.Type` to get actual GridX, not production cost estimation.

```typescript
import { buildTechProgressData, getGridXFromPrereqTech, getEstimatedTechsAtGridX } from '$lib/utils/tech-progress';

const techData = buildTechProgressData(technologies);
const gridX = getGridXFromPrereqTech(techData, unit.PrereqTech);
const techsResearched = getEstimatedTechsAtGridX(techData, gridX);


**Why not estimate from cost?** Unit production costs don't correlate with GridX like buildings do. A 300-cost unit might need Gunpowder (GridX 7, 36 techs), not match buildings at GridX 5 (27 techs).

```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Name has weird tags | Use `stripColorTags()` from `$lib/utils/civilopedia-parser` |
| Cost field is 0 or missing | Extract from Help text using `parseCostFromHelp()` |
| Can't find expected unit | Check for barbarian variants or unique replacements |
| Type assertion errors | Cast the import: `(civilopediaData as { units: Unit[] })` |
| Wrong tech count for unit | Use `PrereqTech.Type` → GridX, not production cost estimation |

## References

See the actual source files for complete type definitions:
- Types: `src/lib/types/civilopedia.ts`
- Parser: `src/lib/utils/civilopedia-parser.ts`
- Data: `src/lib/data/civilopedia_export.json`
