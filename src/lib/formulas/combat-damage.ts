/**
 * Civilization 5 Vox Populi Combat Damage Calculation System
 *
 * Translates C++ damage formulas from CvGameCoreDLL_Expansion2 to TypeScript.
 * This module handles melee, ranged, and city combat damage calculations.
 *
 * @source CvUnitCombat.cpp:3039 - DoDamageMath()
 * @source CvUnit.cpp:5257 - getMeleeCombatDamageCity()
 * @source CvUnit.cpp:5334 - getMeleeCombatDamage()
 * @source CvUnit.cpp:16241 - GetMaxAttackStrength()
 * @source CvUnit.cpp:16449 - GetMaxDefenseStrength()
 * @source CvUnit.cpp:16674 - GetMaxRangedCombatStrength()
 */

import type { GameContext } from '$lib/types/game-context';

/**
 * Combat damage constants - these values can be overridden for visualization
 */
export interface CombatDamageConstants {
	/** Base minimum damage for same-strength melee units (times 100) */
	ATTACK_SAME_STRENGTH_MIN_DAMAGE: number;
	/** Possible extra damage for same-strength melee units (times 100) */
	ATTACK_SAME_STRENGTH_POSSIBLE_EXTRA_DAMAGE: number;
	/** Base minimum damage for same-strength ranged units (times 100) */
	RANGE_ATTACK_SAME_STRENGTH_MIN_DAMAGE: number;
	/** Possible extra damage for same-strength ranged units (times 100) */
	RANGE_ATTACK_SAME_STRENGTH_POSSIBLE_EXTRA_DAMAGE: number;
	/** Damage modifier when attacking a city (in hundredths) */
	CITY_ATTACKING_DAMAGE_MOD: number;
	/** Damage modifier when city attacks a melee unit (in hundredths) */
	ATTACKING_CITY_MELEE_DAMAGE_MOD: number;
}

export const COMBAT_DAMAGE_CONSTANTS_VP_DEFAULTS: CombatDamageConstants = {
	ATTACK_SAME_STRENGTH_MIN_DAMAGE: 2400, // 24 hp base
	ATTACK_SAME_STRENGTH_POSSIBLE_EXTRA_DAMAGE: 1200, // 12 hp max random
	RANGE_ATTACK_SAME_STRENGTH_MIN_DAMAGE: 2400,
	RANGE_ATTACK_SAME_STRENGTH_POSSIBLE_EXTRA_DAMAGE: 1200,
	CITY_ATTACKING_DAMAGE_MOD: 0, // 100% in CP, 0% modifier in VP (net 100%)
	ATTACKING_CITY_MELEE_DAMAGE_MOD: 0 // 100% in CP, 0% modifier in VP (net 100%)
};

/**
 * Options for damage calculation
 */
export interface DamageCalculationOptions {
	/** Custom damage constants to override defaults */
	constants?: Partial<CombatDamageConstants>;
	/** Defender damage modifier in hundredths (promotions, terrain, etc.) */
	defenderDamageTakenMod?: number;
	/** Attacker damage modifier in hundredths (damage taken modifiers) */
	attackerDamageTakenMod?: number;
	/** Include random variance in damage */
	includeRandom?: boolean;
	/** Current damage on defender (affects strength from HP) */
	defenderCurrentDamage?: number;
	/** Max HP of defender (for damage-based strength reduction) */
	defenderMaxHP?: number;
	/** Extra damage modifier for special cases */
	extraDamageModifier?: number;
	/** Whether defender is embarked (reduces damage in some cases) */
	defenderEmbarked?: boolean;
	/** Whether this is a ranged attack */
	isRanged?: boolean;
	/** Whether attack is vs a city */
	isVsCity?: boolean;
	/** Garrison max HP when attacking city */
	garrisonMaxHP?: number;
}

/**
 * Result from a damage calculation
 */
export interface CombatDamageResult {
	/** Damage dealt to defender (times 100, actual damage = result/100) */
	damageInflicted100: number;
	/** Actual damage in HP */
	damageInflicted: number;
	/** Damage taken by attacker */
	damageTaken: number;
	/** Attacker's final HP after combat */
	attackerFinalHP: number;
	/** Defender's final HP after combat */
	defenderFinalHP: number;
}

/**
 * Core damage formula - calculates damage based on strength ratio
 *
 * This is the base formula that underpins all combat in VP.
 * Damage is multiplied by a ratio based on how different the units' strengths are.
 * Close fights do less damage, mismatches do more damage.
 *
 * Formula breakdown:
 * - Base damage = defaultDamage + random(0, maxRandomDamage)
 * - Strength Ratio = ((Attacker/Defender + 3) / 4) ^ 4
 * - Final Damage = Base * Ratio * (1 + modifierPercent/100)
 *
 * @param attackerStrength100 - Attacker strength multiplied by 100
 * @param defenderStrength100 - Defender strength multiplied by 100
 * @param defaultDamage100 - Base damage multiplied by 100
 * @param maxRandomDamage100 - Maximum random damage multiplied by 100
 * @param modifierPercent - Damage modifier in hundredths (e.g., -20 = 80% damage)
 * @returns Damage dealt multiplied by 100
 *
 * @source CvUnitCombat.cpp:3039
 */
export function doDamageMath(
	attackerStrength100: number,
	defenderStrength100: number,
	defaultDamage100: number,
	maxRandomDamage100: number,
	modifierPercent: number = 0,
	includeRandom: boolean = false
): number {
	// Base damage
	let damage = defaultDamage100;

	// Add random component (or use expected value if not including random)
	if (includeRandom && maxRandomDamage100 > 0) {
		// In actual game: GC.getGame().randRangeExclusive(0, maxRandomDamage100)
		// For simulation: use average
		damage += Math.floor(maxRandomDamage100 / 2);
	} else {
		damage += Math.floor(maxRandomDamage100 / 2);
	}

	// Calculate strength ratio
	// Ratio = (((Attacker/Defender + 3) / 4) ^ 4 + 1) / 2
	let strengthRatio: number;

	if (defenderStrength100 > attackerStrength100) {
		// Defender is stronger - calculate ratio then invert
		strengthRatio = defenderStrength100 / Math.max(1, attackerStrength100);
		strengthRatio = (strengthRatio + 3) / 4;
		strengthRatio = Math.pow(strengthRatio, 4.0);
		strengthRatio = Math.min(1000, (strengthRatio + 1) / 2); // Cap to prevent overflow
		strengthRatio = 1 / strengthRatio; // Invert so ratio > 1
	} else {
		// Attacker is stronger
		strengthRatio = attackerStrength100 / Math.max(1, defenderStrength100);
		strengthRatio = (strengthRatio + 3) / 4;
		strengthRatio = Math.pow(strengthRatio, 4.0);
		strengthRatio = Math.min(1000, (strengthRatio + 1) / 2); // Cap to prevent overflow
	}

	// Apply ratio
	damage = Math.floor(damage * strengthRatio);

	// Apply modifier
	if (modifierPercent !== 0) {
		damage = Math.floor((damage * (100 + modifierPercent)) / 100);
	}

	return Math.max(0, damage);
}

/**
 * Calculate melee combat damage between two units
 *
 * Both units take damage. The attacker's damage taken is affected by
 * the defender's strength and combat modifiers.
 *
 * @param attackerStrength - Melee attack strength (from GetMaxAttackStrength)
 * @param defenderStrength - Melee defense strength (from GetMaxDefenseStrength)
 * @param defenderDamageTaken - Current damage on the defender unit
 * @param defenderMaxHP - Maximum HP of defender
 * @param options - Additional calculation options
 * @returns Combat damage result
 *
 * @source CvUnit.cpp:5334
 */
export function calculateMeleeCombatDamage(
	attackerStrength: number,
	defenderStrength: number,
	attackerMaxHP: number,
	defenderMaxHP: number,
	options: DamageCalculationOptions = {}
): CombatDamageResult {
	const constants = { ...COMBAT_DAMAGE_CONSTANTS_VP_DEFAULTS, ...options.constants };
	const defenderDamageMod = options.defenderDamageTakenMod ?? 0;
	const attackerDamageMod = options.attackerDamageTakenMod ?? 0;

	// Damage defender takes
	let damageTaken100 = doDamageMath(
		attackerStrength * 100,
		defenderStrength * 100,
		constants.ATTACK_SAME_STRENGTH_MIN_DAMAGE,
		constants.ATTACK_SAME_STRENGTH_POSSIBLE_EXTRA_DAMAGE,
		defenderDamageMod,
		options.includeRandom ?? false
	);

	// Convert from "times 100" to actual HP
	let damageTaken = Math.floor(damageTaken100 / 100);

	// Damage attacker takes
	let damageInflicted100 = doDamageMath(
		defenderStrength * 100,
		attackerStrength * 100,
		constants.ATTACK_SAME_STRENGTH_MIN_DAMAGE,
		constants.ATTACK_SAME_STRENGTH_POSSIBLE_EXTRA_DAMAGE,
		attackerDamageMod,
		options.includeRandom ?? false
	);

	let damageInflicted = Math.floor(damageInflicted100 / 100);

	// Calculate final HP
	const currentDefenderDamage = options.defenderCurrentDamage ?? 0;
	const defenderFinalHP = Math.max(1, defenderMaxHP - currentDefenderDamage - damageTaken);
	const attackerFinalHP = Math.max(0, attackerMaxHP - damageInflicted);

	// Mutual death check: if both would die, survivor is determined by who has more total HP
	const defenderWouldDie = damageTaken + currentDefenderDamage >= defenderMaxHP;
	const attackerWouldDie = damageInflicted >= attackerMaxHP;

	if (defenderWouldDie && attackerWouldDie) {
		// Both die - check who has higher remaining HP with damage
		const defenderTotalDamage = currentDefenderDamage + damageTaken;
		const attackerTotalDamage = damageInflicted;

		if (defenderTotalDamage > attackerTotalDamage) {
			// Defender survives with 1 HP
			return {
				damageInflicted100,
				damageInflicted,
				damageTaken,
				attackerFinalHP: 1,
				defenderFinalHP: attackerMaxHP - 1
			};
		} else {
			// Attacker survives with 1 HP
			return {
				damageInflicted100,
				damageInflicted: attackerMaxHP - 1,
				damageTaken: defenderMaxHP - 1,
				attackerFinalHP: attackerMaxHP - 1,
				defenderFinalHP: 1
			};
		}
	}

	// One unit dies - adjust damage if needed
	if (defenderWouldDie) {
		// Cap damage to exact death amount
		damageTaken = defenderMaxHP - currentDefenderDamage;
	}
	if (attackerWouldDie) {
		// Cap damage to exact death amount
		damageInflicted = attackerMaxHP;
	}

	return {
		damageInflicted100,
		damageInflicted,
		damageTaken,
		attackerFinalHP: Math.max(0, attackerMaxHP - damageInflicted),
		defenderFinalHP: Math.max(0, defenderMaxHP - currentDefenderDamage - damageTaken)
	};
}

/**
 * Calculate damage when unit attacks a city
 *
 * Cities don't retaliate with ranged fire; they only deal melee damage.
 * The unit takes damage from the city's garrison strength.
 *
 * @param unitStrength - Unit attack strength
 * @param cityStrength - City defense strength (usually garrison-based)
 * @param unitMaxHP - Maximum HP of attacking unit
 * @param cityMaxHP - Maximum HP of the city
 * @param options - Additional calculation options
 * @returns Combat damage result
 *
 * @source CvUnit.cpp:5257
 */
export function calculateCityMeleeCombatDamage(
	unitStrength: number,
	cityStrength: number,
	unitMaxHP: number,
	cityMaxHP: number,
	options: DamageCalculationOptions = {}
): CombatDamageResult {
	const constants = { ...COMBAT_DAMAGE_CONSTANTS_VP_DEFAULTS, ...options.constants };

	// Unit takes damage from city
	// Modifier = CITY_ATTACKING_DAMAGE_MOD - 100
	const unitDamageMod = (constants.CITY_ATTACKING_DAMAGE_MOD ?? 0) - 100;

	let unitDamageInflicted100 = doDamageMath(
		cityStrength * 100,
		unitStrength * 100,
		constants.ATTACK_SAME_STRENGTH_MIN_DAMAGE,
		constants.ATTACK_SAME_STRENGTH_POSSIBLE_EXTRA_DAMAGE,
		unitDamageMod,
		options.includeRandom ?? false
	);

	let unitDamageInflicted = Math.floor(unitDamageInflicted100 / 100);

	// City takes damage from unit
	// Modifier = ATTACKING_CITY_MELEE_DAMAGE_MOD - 100
	const cityDamageMod = (constants.ATTACKING_CITY_MELEE_DAMAGE_MOD ?? 0) - 100;

	let cityDamageInflicted100 = doDamageMath(
		unitStrength * 100,
		cityStrength * 100,
		constants.ATTACK_SAME_STRENGTH_MIN_DAMAGE,
		constants.ATTACK_SAME_STRENGTH_POSSIBLE_EXTRA_DAMAGE,
		cityDamageMod,
		options.includeRandom ?? false
	);

	let cityDamageInflicted = Math.floor(cityDamageInflicted100 / 100);

	// City has flat damage reduction (some buildings/policies)
	// In this simplified version, we assume no flat reduction
	// In actual game: cityDamageInflicted = max(0, cityDamageInflicted - city.getDamageReductionFlat())

	// Check garrison absorption (MOD_CORE_GARRISON_DAMAGE_ABSORPTION)
	// For now, assume no garrison damage absorption
	const garrisonMaxHP = options.garrisonMaxHP ?? 0;
	let garrisonDamage = 0;
	if (garrisonMaxHP > 0) {
		// Garrison absorbs damage based on HP ratio
		garrisonDamage = Math.floor(
			(cityDamageInflicted * 2 * garrisonMaxHP) / (cityMaxHP + 2 * garrisonMaxHP)
		);
		cityDamageInflicted -= garrisonDamage;
	}

	const currentCityDamage = options.defenderCurrentDamage ?? 0;
	const currentUnitDamage = 0; // Units don't have pre-existing damage in this context

	// Mutual death check
	const cityWouldDie = cityDamageInflicted + currentCityDamage >= cityMaxHP;
	const unitWouldDie = unitDamageInflicted >= unitMaxHP;

	if (cityWouldDie && unitWouldDie) {
		// City wins if it survives with the unit
		cityDamageInflicted = cityMaxHP - currentCityDamage;
		unitDamageInflicted = unitMaxHP - 1;
	} else if (cityWouldDie) {
		cityDamageInflicted = cityMaxHP - currentCityDamage;
	} else if (unitWouldDie) {
		unitDamageInflicted = unitMaxHP;
	}

	return {
		damageInflicted100: cityDamageInflicted100,
		damageInflicted: cityDamageInflicted,
		damageTaken: unitDamageInflicted,
		attackerFinalHP: Math.max(0, unitMaxHP - unitDamageInflicted),
		defenderFinalHP: Math.max(0, cityMaxHP - currentCityDamage - cityDamageInflicted)
	};
}

/**
 * Calculate ranged attack damage
 *
 * Ranged units do not take return fire in ranged combat.
 * However, they can take damage from other ranged units that intercept.
 *
 * @param attackerRangedStrength - Ranged attack strength
 * @param defenderStrength - Defender's ranged defense or melee strength
 * @param defenderMaxHP - Maximum HP of defender
 * @param options - Additional calculation options
 * @returns Damage inflicted by ranged attack
 *
 * @source CvUnitCombat.cpp (ranged combat section)
 */
export function calculateRangedCombatDamage(
	attackerRangedStrength: number,
	defenderStrength: number,
	defenderMaxHP: number,
	options: DamageCalculationOptions = {}
): { damageInflicted100: number; damageInflicted: number } {
	const constants = { ...COMBAT_DAMAGE_CONSTANTS_VP_DEFAULTS, ...options.constants };
	const defenderDamageMod = options.defenderDamageTakenMod ?? 0;

	// Ranged uses its own damage formula
	const damageInflicted100 = doDamageMath(
		attackerRangedStrength * 100,
		defenderStrength * 100,
		constants.RANGE_ATTACK_SAME_STRENGTH_MIN_DAMAGE,
		constants.RANGE_ATTACK_SAME_STRENGTH_POSSIBLE_EXTRA_DAMAGE,
		defenderDamageMod,
		options.includeRandom ?? false
	);

	let damageInflicted = Math.floor(damageInflicted100 / 100);

	// Cap to max HP if needed
	const currentDefenderDamage = options.defenderCurrentDamage ?? 0;
	if (damageInflicted + currentDefenderDamage > defenderMaxHP) {
		damageInflicted = defenderMaxHP - currentDefenderDamage;
	}

	return {
		damageInflicted100,
		damageInflicted
	};
}

/**
 * Combat strength modifiers from promotions and abilities
 *
 * These represent the main promotion effects that modify combat strength
 */
export interface CombatModifiers {
	/** Attack strength percentage modifier (e.g., +10 means +10%) */
	attackModifier?: number;
	/** Defense strength percentage modifier */
	defenseModifier?: number;
	/** Ranged attack strength percentage modifier */
	rangedAttackModifier?: number;
	/** Ranged defense modifier */
	rangedDefenseModifier?: number;
	/** Damage modifier from wounds (negative when damaged) */
	damageModifier?: number;
	/** Terrain-specific modifiers */
	terrainModifiers?: {
		hills?: number;
		forest?: number;
		mountain?: number;
		rough?: number;
		open?: number;
	};
	/** Unit class counters (bonus vs specific unit types) */
	unitCounterModifiers?: Record<string, number>;
	/** Resource monopoly bonuses */
	monopolyBonus?: number;
	/** Policy bonuses */
	policyBonus?: number;
	/** Great General bonus */
	greatGeneralBonus?: number;
	/** City defense bonus when defending */
	cityDefenseBonus?: number;
	/** Flanking bonus */
	flankingBonus?: number;
	/** Formation bonus (adjacent friendly units) */
	formationBonus?: number;
}

/**
 * Apply combat modifiers to calculate effective strength
 *
 * @param baseStrength - Base combat strength (from unit data)
 * @param modifiers - Combat modifiers to apply
 * @returns Effective combat strength
 */
export function calculateModifiedCombatStrength(
	baseStrength: number,
	modifiers: CombatModifiers
): number {
	let modified = baseStrength;

	// Apply percentage modifiers
	if (modifiers.attackModifier) {
		modified = Math.floor((modified * (100 + modifiers.attackModifier)) / 100);
	}
	if (modifiers.damageModifier) {
		modified = Math.floor((modified * (100 + modifiers.damageModifier)) / 100);
	}

	// Apply bonus modifiers (add directly)
	let bonusModifier = 0;
	if (modifiers.terrainModifiers) {
		bonusModifier += Object.values(modifiers.terrainModifiers).reduce((a, b) => a + b, 0);
	}
	if (modifiers.monopolyBonus) bonusModifier += modifiers.monopolyBonus;
	if (modifiers.policyBonus) bonusModifier += modifiers.policyBonus;
	if (modifiers.greatGeneralBonus) bonusModifier += modifiers.greatGeneralBonus;
	if (modifiers.formationBonus) bonusModifier += modifiers.formationBonus;

	modified += bonusModifier;

	return Math.max(0, modified);
}

/**
 * Example: Simulate a melee combat between two units
 *
 * @param attacker - Attacker unit data (name, strength, HP)
 * @param defender - Defender unit data
 * @param context - Game context for speed/era adjustments
 * @returns Combat result
 */
export function simulateMeleeCombat(
	attacker: { name: string; strength: number; maxHP: number },
	defender: { name: string; strength: number; maxHP: number },
	context?: GameContext
): CombatDamageResult & { summary: string } {
	const result = calculateMeleeCombatDamage(
		attacker.strength,
		defender.strength,
		attacker.maxHP,
		defender.maxHP,
		{
			includeRandom: true
		}
	);

	const attackerSurvives = result.attackerFinalHP > 0;
	const defenderSurvives = result.defenderFinalHP > 0;

	let summary = `${attacker.name} (${attacker.strength}⚔️) vs ${defender.name} (${defender.strength}⚔️)\n`;
	summary += `Damage dealt: ${result.damageInflicted} HP\n`;
	summary += `Damage taken: ${result.damageTaken} HP\n`;
	summary += `Result: ${attackerSurvives ? attacker.name : defender.name} wins`;

	return {
		...result,
		summary
	};
}
