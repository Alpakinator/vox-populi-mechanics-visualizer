/**
 * Builds combat unit upgrade chains from civilopedia data using VP's
 * UnitClass_Upgrades definitions and the units available in the JSON export.
 *
 * Upgrade class hierarchy sourced from:
 * (2) Vox Populi/Database Changes/Units/UnitChanges2.sql lines 384-481
 */

import type { Unit } from '$lib/types/civilopedia';
import { parseCostFromHelp, stripColorTags } from '$lib/utils/civilopedia-parser';

// =============================================================================
// TYPES
// =============================================================================

export interface CombatUnitData {
	type: string;
	name: string;
	unitClass: string;
	combat: number;
	rangedCombat: number;
	productionCost: number;
	domain: string;
	eraId: number;
	eraName: string;
	/** Primary strength: max(combat, rangedCombat) */
	primaryStrength: number;
}

export interface UpgradeChain {
	/** Display name for this upgrade line */
	name: string;
	/** Ordered list of units in this chain (by era/tech progression) */
	units: CombatUnitData[];
}

// =============================================================================
// VP UPGRADE CLASS HIERARCHY
// =============================================================================

/**
 * Unit class upgrade edges from VP's UnitChanges2.sql.
 * Each entry: [fromClass, toClass]
 */
const UPGRADE_EDGES: [string, string][] = [
	// Melee/Gun
	['UNITCLASS_WARRIOR', 'UNITCLASS_SPEARMAN'],
	['UNITCLASS_SPEARMAN', 'UNITCLASS_PIKEMAN'],
	['UNITCLASS_SWORDSMAN', 'UNITCLASS_LONGSWORDSMAN'],
	['UNITCLASS_PIKEMAN', 'UNITCLASS_TERCIO'],
	['UNITCLASS_LONGSWORDSMAN', 'UNITCLASS_TERCIO'],
	['UNITCLASS_TERCIO', 'UNITCLASS_RIFLEMAN'],
	['UNITCLASS_RIFLEMAN', 'UNITCLASS_GREAT_WAR_INFANTRY'],
	['UNITCLASS_GREAT_WAR_INFANTRY', 'UNITCLASS_INFANTRY'],
	['UNITCLASS_INFANTRY', 'UNITCLASS_MECHANIZED_INFANTRY'],
	// Ranged
	['UNITCLASS_SLINGER', 'UNITCLASS_ARCHER'],
	['UNITCLASS_ARCHER', 'UNITCLASS_COMPOSITE_BOWMAN'],
	['UNITCLASS_COMPOSITE_BOWMAN', 'UNITCLASS_CROSSBOWMAN'],
	['UNITCLASS_CROSSBOWMAN', 'UNITCLASS_MUSKETMAN'],
	['UNITCLASS_MUSKETMAN', 'UNITCLASS_GATLINGGUN'],
	['UNITCLASS_GATLINGGUN', 'UNITCLASS_MACHINE_GUN'],
	['UNITCLASS_MACHINE_GUN', 'UNITCLASS_BAZOOKA'],
	// Mounted Melee/Armor
	['UNITCLASS_HORSEMAN', 'UNITCLASS_KNIGHT'],
	['UNITCLASS_KNIGHT', 'UNITCLASS_LANCER'],
	['UNITCLASS_LANCER', 'UNITCLASS_WWI_TANK'],
	['UNITCLASS_WWI_TANK', 'UNITCLASS_TANK'],
	['UNITCLASS_TANK', 'UNITCLASS_MODERN_ARMOR'],
	['UNITCLASS_MODERN_ARMOR', 'UNITCLASS_MECH'],
	// Skirmisher
	['UNITCLASS_CHARIOT_ARCHER', 'UNITCLASS_SKIRMISHER'],
	['UNITCLASS_SKIRMISHER', 'UNITCLASS_HEAVY_SKIRMISHER'],
	['UNITCLASS_HEAVY_SKIRMISHER', 'UNITCLASS_CUIRASSIER'],
	['UNITCLASS_CUIRASSIER', 'UNITCLASS_CAVALRY'],
	['UNITCLASS_CAVALRY', 'UNITCLASS_ANTI_TANK_GUN'],
	['UNITCLASS_ANTI_TANK_GUN', 'UNITCLASS_HELICOPTER_GUNSHIP'],
	// Siege
	['UNITCLASS_CATAPULT', 'UNITCLASS_TREBUCHET'],
	['UNITCLASS_TREBUCHET', 'UNITCLASS_CANNON'],
	['UNITCLASS_CANNON', 'UNITCLASS_FIELD_GUN'],
	['UNITCLASS_FIELD_GUN', 'UNITCLASS_ARTILLERY'],
	['UNITCLASS_ARTILLERY', 'UNITCLASS_ROCKET_ARTILLERY'],
	// Recon
	['UNITCLASS_PATHFINDER', 'UNITCLASS_SCOUT'],
	['UNITCLASS_SCOUT', 'UNITCLASS_EXPLORER'],
	['UNITCLASS_EXPLORER', 'UNITCLASS_COMMANDO'],
	['UNITCLASS_COMMANDO', 'UNITCLASS_PARATROOPER'],
	['UNITCLASS_PARATROOPER', 'UNITCLASS_MARINE'],
	['UNITCLASS_MARINE', 'UNITCLASS_XCOM_SQUAD'],
	// Anti-air
	['UNITCLASS_ANTI_AIRCRAFT_GUN', 'UNITCLASS_MOBILE_SAM'],
	// Naval Melee
	['UNITCLASS_GALLEY', 'UNITCLASS_TRIREME'],
	['UNITCLASS_TRIREME', 'UNITCLASS_CARAVEL'],
	['UNITCLASS_CARAVEL', 'UNITCLASS_PRIVATEER'],
	['UNITCLASS_PRIVATEER', 'UNITCLASS_IRONCLAD'],
	['UNITCLASS_IRONCLAD', 'UNITCLASS_DESTROYER'],
	['UNITCLASS_DESTROYER', 'UNITCLASS_FLEET_DESTROYER'],
	['UNITCLASS_FLEET_DESTROYER', 'UNITCLASS_SENSOR_COMBAT_SHIP'],
	// Naval Ranged
	['UNITCLASS_LIBURNA', 'UNITCLASS_GALLEASS'],
	['UNITCLASS_GALLEASS', 'UNITCLASS_FRIGATE'],
	['UNITCLASS_FRIGATE', 'UNITCLASS_CRUISER'],
	['UNITCLASS_CRUISER', 'UNITCLASS_DREADNOUGHT'],
	['UNITCLASS_DREADNOUGHT', 'UNITCLASS_BATTLESHIP'],
	['UNITCLASS_BATTLESHIP', 'UNITCLASS_MISSILE_CRUISER'],
	// Submarine
	['UNITCLASS_SUBMARINE', 'UNITCLASS_ATTACK_SUBMARINE'],
	['UNITCLASS_ATTACK_SUBMARINE', 'UNITCLASS_NUCLEAR_SUBMARINE'],
	// Carrier
	['UNITCLASS_CARRIER', 'UNITCLASS_SUPERCARRIER'],
	// Fighter
	['UNITCLASS_TRIPLANE', 'UNITCLASS_FIGHTER'],
	['UNITCLASS_FIGHTER', 'UNITCLASS_JET_FIGHTER'],
	// Bomber
	['UNITCLASS_WWI_BOMBER', 'UNITCLASS_BOMBER'],
	['UNITCLASS_BOMBER', 'UNITCLASS_STEALTH_BOMBER'],
];

/**
 * Named chain definitions. Each defines a root-to-leaf path through the
 * upgrade graph. Where chains merge (e.g., Pikeman + Longswordsman → Tercio),
 * the merged tail is included in both chains.
 */
const CHAIN_DEFINITIONS: { name: string; classes: string[] }[] = [
	{
		name: 'Melee (Anti-Mounted)',
		classes: [
			'UNITCLASS_WARRIOR', 'UNITCLASS_SPEARMAN', 'UNITCLASS_PIKEMAN',
			'UNITCLASS_TERCIO', 'UNITCLASS_RIFLEMAN', 'UNITCLASS_GREAT_WAR_INFANTRY',
			'UNITCLASS_INFANTRY', 'UNITCLASS_MECHANIZED_INFANTRY'
		]
	},
	{
		name: 'Melee (Shock)',
		classes: [
			'UNITCLASS_SWORDSMAN', 'UNITCLASS_LONGSWORDSMAN',
			'UNITCLASS_TERCIO', 'UNITCLASS_RIFLEMAN', 'UNITCLASS_GREAT_WAR_INFANTRY',
			'UNITCLASS_INFANTRY', 'UNITCLASS_MECHANIZED_INFANTRY'
		]
	},
	{
		name: 'Ranged',
		classes: [
			'UNITCLASS_SLINGER', 'UNITCLASS_ARCHER', 'UNITCLASS_COMPOSITE_BOWMAN',
			'UNITCLASS_CROSSBOWMAN', 'UNITCLASS_MUSKETMAN', 'UNITCLASS_GATLINGGUN',
			'UNITCLASS_MACHINE_GUN', 'UNITCLASS_BAZOOKA'
		]
	},
	{
		name: 'Mounted/Armor',
		classes: [
			'UNITCLASS_HORSEMAN', 'UNITCLASS_KNIGHT', 'UNITCLASS_LANCER',
			'UNITCLASS_WWI_TANK', 'UNITCLASS_TANK', 'UNITCLASS_MODERN_ARMOR',
			'UNITCLASS_MECH'
		]
	},
	{
		name: 'Skirmisher/Cavalry',
		classes: [
			'UNITCLASS_CHARIOT_ARCHER', 'UNITCLASS_SKIRMISHER',
			'UNITCLASS_HEAVY_SKIRMISHER', 'UNITCLASS_CUIRASSIER',
			'UNITCLASS_CAVALRY', 'UNITCLASS_ANTI_TANK_GUN',
			'UNITCLASS_HELICOPTER_GUNSHIP'
		]
	},
	{
		name: 'Siege',
		classes: [
			'UNITCLASS_CATAPULT', 'UNITCLASS_TREBUCHET', 'UNITCLASS_CANNON',
			'UNITCLASS_FIELD_GUN', 'UNITCLASS_ARTILLERY', 'UNITCLASS_ROCKET_ARTILLERY'
		]
	},
	{
		name: 'Recon',
		classes: [
			'UNITCLASS_PATHFINDER', 'UNITCLASS_SCOUT', 'UNITCLASS_EXPLORER',
			'UNITCLASS_COMMANDO', 'UNITCLASS_PARATROOPER', 'UNITCLASS_MARINE',
			'UNITCLASS_XCOM_SQUAD'
		]
	},
	{
		name: 'Naval Melee',
		classes: [
			'UNITCLASS_GALLEY', 'UNITCLASS_TRIREME', 'UNITCLASS_CARAVEL',
			'UNITCLASS_PRIVATEER', 'UNITCLASS_IRONCLAD', 'UNITCLASS_DESTROYER',
			'UNITCLASS_FLEET_DESTROYER', 'UNITCLASS_SENSOR_COMBAT_SHIP'
		]
	},
	{
		name: 'Naval Ranged',
		classes: [
			'UNITCLASS_LIBURNA', 'UNITCLASS_GALLEASS', 'UNITCLASS_FRIGATE',
			'UNITCLASS_CRUISER', 'UNITCLASS_DREADNOUGHT', 'UNITCLASS_BATTLESHIP',
			'UNITCLASS_MISSILE_CRUISER'
		]
	},
	{
		name: 'Submarine',
		classes: [
			'UNITCLASS_SUBMARINE', 'UNITCLASS_ATTACK_SUBMARINE',
			'UNITCLASS_NUCLEAR_SUBMARINE'
		]
	},
	{
		name: 'Fighter',
		classes: ['UNITCLASS_TRIPLANE', 'UNITCLASS_FIGHTER', 'UNITCLASS_JET_FIGHTER']
	},
	{
		name: 'Bomber',
		classes: ['UNITCLASS_WWI_BOMBER', 'UNITCLASS_BOMBER', 'UNITCLASS_STEALTH_BOMBER']
	},
	{
		name: 'Anti-Air',
		classes: ['UNITCLASS_ANTI_AIRCRAFT_GUN', 'UNITCLASS_MOBILE_SAM']
	},
];

// =============================================================================
// CHAIN BUILDING
// =============================================================================

/**
 * Extracts a CombatUnitData from a raw Unit, or returns undefined if the unit
 * has no combat stats or no parseable production cost.
 */
function extractCombatUnit(unit: Unit): CombatUnitData | undefined {
	const combat = unit.Combat ?? 0;
	const rangedCombat = unit.RangedCombat ?? 0;

	if (combat === 0 && rangedCombat === 0) return undefined;

	const costs = parseCostFromHelp(unit.Help);
	if (!costs) return undefined;

	return {
		type: unit.Type,
		name: stripColorTags(unit.Name),
		unitClass: unit.Class,
		combat,
		rangedCombat,
		productionCost: costs.production,
		domain: unit.Domain,
		eraId: unit.EraID,
		eraName: unit.EraName,
		primaryStrength: Math.max(combat, rangedCombat)
	};
}

/**
 * Builds all upgrade chains from the civilopedia unit list.
 * Only includes non-unique (base) units — units with a populated Replaces
 * field are excluded.
 *
 * @returns Array of upgrade chains, each containing its available units
 *          sorted by era. Chains with no units in the JSON are omitted.
 */
export function buildUpgradeChains(units: Unit[]): UpgradeChain[] {
	// Build a map: unitClass → base unit data
	const unitByClass = new Map<string, CombatUnitData>();

	for (const unit of units) {
		// Skip unique units (those with Replaces populated)
		const isUniqueUnit = unit.Replaces && Array.isArray(unit.Replaces) && unit.Replaces.length > 0;
		if (isUniqueUnit) continue;

		// Skip barbarian units
		if (unit.Name.includes('Barbarian')) continue;

		const data = extractCombatUnit(unit);
		if (!data) continue;

		// Prefer the first non-unique unit found for each class
		if (!unitByClass.has(data.unitClass)) {
			unitByClass.set(data.unitClass, data);
		}
	}

	const chains: UpgradeChain[] = [];

	for (const def of CHAIN_DEFINITIONS) {
		const chainUnits: CombatUnitData[] = [];

		for (const cls of def.classes) {
			const unit = unitByClass.get(cls);
			if (unit) {
				chainUnits.push(unit);
			}
		}

		// Only include chains that have at least 2 units
		if (chainUnits.length >= 2) {
			// Sort by eraId then by production cost within same era
			chainUnits.sort((a, b) => a.eraId - b.eraId || a.productionCost - b.productionCost);
			chains.push({ name: def.name, units: chainUnits });
		}
	}

	return chains;
}
