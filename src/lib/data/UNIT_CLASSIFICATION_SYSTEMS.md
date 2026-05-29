# Unit Classification Systems

This project uses two complementary classification systems for combat units. They serve different purposes and should not be confused.

## 1. UNITCLASS Upgrade Chains

**Purpose**: Graph visualization and unit progression tracking  
**Source**: VP's `UnitChanges2.sql` (upgrade definitions)  
**Location**: [src/lib/utils/unit-upgrade-chains.ts](../utils/unit-upgrade-chains.ts)  
**Data Structure**: Linear progression chains (root → leaf)

### How It Works
Units are grouped into upgrade chains that represent how units evolve through eras. These chains naturally follow the game's progression system where units upgrade into more advanced versions.

### Example
**Melee (Anti-Mounted)** chain:
```
Warrior → Spearman → Pikeman → Tercio → Rifleman → Great War Infantry → Infantry → Mechanized Infantry
```

### Usage in Graphs
- Each upgrade chain gets a unique color in the combat efficiency graphs
- Graph traces connect units along their progression path
- Enables visual analysis of how a particular unit line evolves in strength/cost ratios across eras

### Key Properties
- Follows Vox Populi's upgrade system (`UNITCLASS` hierarchy)
- Includes merged chains (e.g., both Pikeman and Longswordsman paths merge into Tercio)
- Excludes unique/civ-specific units (those with `Replaces` populated)
- Excludes barbarian units
- **13 total chains** covering all combat unit types

---

## 2. Upgrade Chain Groups (Rebalance Presets)

**Purpose**: Rebalance presets organized by the same upgrade chains used for graph visualization  
**Location**: [src/lib/data/unit-rebalance-preset.json](./unit-rebalance-preset.json)  
**Data Structure**: 13 upgrade chain groups, each containing units from that progression

### How It Works
The rebalance preset uses the same upgrade chain grouping as the graph visualization. Each chain represents a unit progression line. When users toggle "Apply rebalance preset", it applies balance modifiers to all units in that upgrade chain.

### Example
**Ranged** chain preset group:
```
Slinger → Archer → Composite Bowman → Crossbowman → Musketman → Gatling Gun → Machine Gun → Bazooka
```
All 19 units in this progression can have their stats modified together.

### Upgrade Chains (13 total)
- **Melee (Anti-Mounted)** — 22 units (Warrior line with spears/pikes)
- **Melee (Shock)** — 10 units (Swordsman line + merged tail)
- **Ranged** — 19 units (Archer → Bowman → Musketman → Gun units)
- **Mounted/Armor** — 16 units (Horseman → Knight → Tank → Mech)
- **Skirmisher/Cavalry** — 20 units (Chariot → Skirmisher → Cavalry)
- **Siege** — 11 units (Catapult → Artillery → Modern siege weapons)
- **Recon** — 11 units (Scout → Commando → Marine → XCOM)
- **Naval Melee** — 17 units (Galley → Privateer → Destroyer)
- **Naval Ranged** — 12 units (Liburna → Frigate → Battleship)
- **Submarine** — 3 units
- **Carrier** — 2 units
- **Fighter** — 4 units (Triplane → Fighter → Jet)
- **Bomber** — 3 units
- **Anti-Air** — 2 units

### Usage in Presets
- Toggle "Apply rebalance preset" in UI to enable/disable an entire upgrade chain
- Each unit in a chain can have `combat`, `rangedCombat`, and `productionCost` overrides
- **168 combat units** total distributed across 14 chains
- Mutations apply to base units; unique/civ-specific variants inherit progression

### Key Properties
- Directly mirrors the graph coloring system for consistency
- Linear progression structure (root→branch→leaf)
- Each unit belongs to exactly one chain
- Enables cohesive balance passes on related unit progressions
- **Note**: Some chains share tail units (e.g., both Melee (Anti-Mounted) and Melee (Shock) merge at Tercio and continue together)

---

## Key Distinction

| Aspect | UNITCLASS Chains | UNITCOMBAT Types |
|--------|------------------|-------------------|
| **Purpose** | Graph visualization + Rebalance presets | Game mechanics (promotions) |
| **Hierarchy** | Linear progression (root→leaf) | Flat classification by combat role |
| **Source System** | Upgrade system (UnitChanges2.sql) | Promotion system (PromotionSweeps.sql) |
| **Grouping Logic** | Unit evolves into next unit | Units share same promotion/modifier type |
| **Count** | 13 chains | 13 types |
| **Overlap** | Chains can merge at tail units | Units belong to exactly one type |
| **Example Chain** | Warrior→...→Infantry | All melee units (various classes) |
| **Implementation** | `unit-rebalance-preset.json` (chainName) | C++ DLL (GD_INT_GET/GD_FLOAT_GET) |

### Note on Design
The rebalance preset originally used UNITCOMBAT grouping but was reorganized to use upgrade chains for consistency with graph visualization. This provides a unified grouping scheme across the entire UI — users see the same 13 unit groups whether they're looking at graphs or applying preset modifiers.

---

## Important Note: UNIT_MUSKETMAN Classification

`UNIT_MUSKETMAN` belongs to:
- **UNITCLASS**: `Ranged` upgrade chain (Archer→...→Musketman→Gatling Gun)
- **UNITCOMBAT** (in DLL): `UNITCOMBAT_GUN` (gunpowder infantry promotions)

Both are correct—they describe different classification dimensions. The upgrade chain shows progression for visualization and preset grouping, while UNITCOMBAT controls which in-game promotions/modifiers apply to the unit.

---

## Data Flow Example

**User clicks "Apply rebalance preset" for Ranged chain:**

1. UI reads `unit-rebalance-preset.json`
2. Finds `Ranged` group with 19 units (Slinger through Bazooka)
3. For each unit in that chain, applies production cost override
4. Graph immediately updates to show new effective costs for all Ranged units
5. Each ranged unit in graph shows with the same "Ranged" color (from upgrade chain coloring)
6. Cost/strength ratios recalculate instantly (if preset multipliers = 100%, no visual change)

