/**
 * Gold Purchase Cost Formulas for Units, Buildings, and Projects
 *
 * Translates the C++ gold purchase calculations from Vox Populi DLL.
 * The core formula uses a power function to create a non-linear relationship
 * between production cost and gold cost.
 *
 * @source CvCity.cpp:11716-11810 - CvCity::GetPurchaseCost(UnitTypes)
 * @source CvCity.cpp:12143-12203 - CvCity::GetPurchaseCost(BuildingTypes)
 * @source CvCity.cpp:12260-12270 - CvCity::GetPurchaseCost(ProjectTypes)
 * @source CvCity.cpp:12275-12302 - CvCity::GetPurchaseCostFromProduction()
 *
 * @constants
 * - GOLD_PURCHASE_GOLD_PER_PRODUCTION: 30 (multiplier for base conversion)
 * - HURRY_GOLD_PRODUCTION_EXPONENT: 0.75 (CP) / 0.68 (VP) (power function exponent)
 * - GOLD_PURCHASE_VISIBLE_DIVISOR: 10 (rounds to nearest 10)
 */

import type { GameContext } from '$lib/types/game-context';
import { floorToDivisor } from './modifiers';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Constants for gold purchase calculations.
 * These can be overridden for visualization/experimentation.
 */
export interface GoldPurchaseConstants {
	/** Base multiplier: production * this = base gold cost before power function */
	GOLD_PURCHASE_GOLD_PER_PRODUCTION: number;
	/** Exponent for power function (0.68 in VP, 0.75 in CP) - lower = better scaling */
	HURRY_GOLD_PRODUCTION_EXPONENT: number;
	/** Round final costs to nearest this value */
	GOLD_PURCHASE_VISIBLE_DIVISOR: number;
}

/** Default constants matching Vox Populi values */
export const GOLD_PURCHASE_CONSTANTS_VP: GoldPurchaseConstants = {
	GOLD_PURCHASE_GOLD_PER_PRODUCTION: 30,
	HURRY_GOLD_PRODUCTION_EXPONENT: 0.68, // VP uses 0.68, CP uses 0.75
	GOLD_PURCHASE_VISIBLE_DIVISOR: 10
};

/** Community Patch constants (for comparison) */
export const GOLD_PURCHASE_CONSTANTS_CP: GoldPurchaseConstants = {
	GOLD_PURCHASE_GOLD_PER_PRODUCTION: 30,
	HURRY_GOLD_PRODUCTION_EXPONENT: 0.75, // CP uses 0.75
	GOLD_PURCHASE_VISIBLE_DIVISOR: 10
};

// =============================================================================
// CORE FORMULA
// =============================================================================

/**
 * Core gold purchase cost calculation from production cost.
 *
 * The formula is:
 *   baseGold = production * GOLD_PURCHASE_GOLD_PER_PRODUCTION
 *   cost = baseGold ^ HURRY_GOLD_PRODUCTION_EXPONENT
 *   cost *= hurryModifier (from policies, etc.)
 *   cost *= gameSpeed.hurryPercent / 100
 *
 * The power function with exponent < 1 means higher production costs
 * have diminishing gold cost returns (better gold/production ratio).
 *
 * @source CvCity.cpp:12275-12302
 *
 * @param production - Base production cost of the item
 * @param ctx - Game context (for game speed)
 * @param hurryModifier - Percentage modifier from policies/buildings (default 0)
 * @param constants - Override constants for visualization
 * @returns Gold cost (before unit/building specific modifiers)
 */
export function getPurchaseCostFromProduction(
	production: number,
	ctx: GameContext,
	hurryModifier: number = 0,
	constants: GoldPurchaseConstants = GOLD_PURCHASE_CONSTANTS_VP
): number {
	if (production <= 0) {
		return 0;
	}

	// Gold per Production multiplier
	// int iPurchaseCostBase = iProduction * /*30*/ GD_INT_GET(GOLD_PURCHASE_GOLD_PER_PRODUCTION);
	const purchaseCostBase = production * constants.GOLD_PURCHASE_GOLD_PER_PRODUCTION;

	// Cost ramps up with power function
	// int iPurchaseCost = (int)pow((double)iPurchaseCostBase, (double) /*0.75f in CP, 0.68f in VP*/ GD_FLOAT_GET(HURRY_GOLD_PRODUCTION_EXPONENT));
	let purchaseCost = Math.floor(Math.pow(purchaseCostBase, constants.HURRY_GOLD_PRODUCTION_EXPONENT));

	// Hurry Mod (Policies, etc.)
	// iPurchaseCost *= max(0, 100 + iHurryMod);
	// iPurchaseCost /= 100;
	if (hurryModifier !== 0) {
		purchaseCost = Math.floor((purchaseCost * Math.max(0, 100 + hurryModifier)) / 100);
	}

	// Game Speed modifier
	// iPurchaseCost *= GC.getGame().getGameSpeedInfo().getHurryPercent();
	// iPurchaseCost /= 100;
	purchaseCost = Math.floor((purchaseCost * ctx.gameSpeed.hurryPercent) / 100);

	return Math.max(0, purchaseCost);
}

// =============================================================================
// UNIT PURCHASE COST
// =============================================================================

/**
 * Options for unit purchase cost calculation
 */
export interface UnitPurchaseCostOptions {
	/** Unit's HurryCostModifier field (-1 = cannot purchase, 0 = normal, positive = % increase) */
	hurryCostModifier?: number;
	/** Player's UnitPurchaseCostModifier from policies/traits */
	playerUnitPurchaseMod?: number;
	/** Player/city-wide hurry modifier from policies/buildings (e.g., Industry policies, Forbidden Palace, Stock Exchange) */
	hurryModifier?: number;
	/** Tech progress percentage (0-100) - techs known / total techs * 100 */
	techProgress?: number;
	/** Enable VP-specific adjustments (tech progress scaling, 20% discount) */
	enableVPAdjustments?: boolean;
	/** Override constants */
	constants?: GoldPurchaseConstants;
}

/**
 * Calculate gold purchase cost for a unit.
 *
 * In VP, unit costs are affected by:
 * 1. Base production-to-gold conversion with power function
 * 2. Unit's individual HurryCostModifier (e.g., -1 for unpurchaseable, 0 for normal, +% for expensive units)
 * 3. Player's UnitPurchaseCostModifier (from traits/policies)
 * 4. Player/city-wide hurry modifiers (Industry policies, Forbidden Palace, Stock Exchange, etc.)
 * 5. Tech progress scaling (more techs = higher cost)
 * 6. Final 20% discount (VP only)
 *
 * Note: Units do NOT have a base -20% modifier like buildings do. That modifier is building-specific.
 * However, they ARE affected by the player/city-wide hurry modifiers (Industry, Forbidden Palace, etc.)
 *
 * @source CvCity.cpp:11716-11810
 *
 * @param productionCost - Unit's production cost
 * @param ctx - Game context
 * @param options - Additional modifiers and settings
 * @returns Gold cost or -1 if unit cannot be purchased
 */
export function getUnitPurchaseCost(
	productionCost: number,
	ctx: GameContext,
	options: UnitPurchaseCostOptions = {}
): number {
	const {
		hurryCostModifier = 0,
		playerUnitPurchaseMod = 0,
		hurryModifier = 0,
		techProgress = 0,
		enableVPAdjustments = true,
		constants = GOLD_PURCHASE_CONSTANTS_VP
	} = options;

	// If HurryCostModifier is -1, unit cannot be purchased with gold
	if (hurryCostModifier === -1) {
		return -1;
	}

	// Base cost from production
	let cost = getPurchaseCostFromProduction(productionCost, ctx, hurryModifier, constants);

	// Unit's individual modifier (e.g., spaceship parts have higher cost)
	// iCost *= max(0, 100 + iModifier);
	// iCost /= 100;
	if (hurryCostModifier !== 0) {
		cost = Math.floor((cost * Math.max(0, 100 + hurryCostModifier)) / 100);
	}

	// Player-wide unit purchase modifier from policies/traits
	// iCost *= max(0, 100 + GET_PLAYER(getOwner()).GetUnitPurchaseCostModifier());
	// iCost /= 100;
	if (playerUnitPurchaseMod !== 0) {
		cost = Math.floor((cost * Math.max(0, 100 + playerUnitPurchaseMod)) / 100);
	}

	if (enableVPAdjustments) {
		// VP: Increase cost based on # of techs researched
		// int iTechProgress = (GET_TEAM(getTeam()).GetTeamTechs()->GetNumTechsKnown() * 100) / GC.getNumTechInfos();
		// iTechProgress /= 2;
		// iCost *= 100 + iTechProgress;
		// iCost /= 100;
		if (techProgress > 0) {
			const techMod = Math.floor(techProgress / 2);
			cost = Math.floor((cost * (100 + techMod)) / 100);
		}

		// VP: Decrease final cost by 20%
		// iCost *= 8;
		// iCost /= 10;
		cost = Math.floor((cost * 8) / 10);
	}

	// Round to visible divisor
	// int iDivisor = /*10*/ GD_INT_GET(GOLD_PURCHASE_VISIBLE_DIVISOR);
	// iCost /= iDivisor;
	// iCost *= iDivisor;
	cost = floorToDivisor(cost, constants.GOLD_PURCHASE_VISIBLE_DIVISOR);

	// Minimum cost
	// return max(/*10*/ GD_INT_GET(GOLD_PURCHASE_VISIBLE_DIVISOR), iCost);
	return Math.max(constants.GOLD_PURCHASE_VISIBLE_DIVISOR, cost);
}

// =============================================================================
// BUILDING PURCHASE COST (INVESTMENT)
// =============================================================================

/**
 * Options for building purchase/investment cost calculation
 */
export interface BuildingPurchaseCostOptions {
	/** Building's base HurryCostModifier field (-20 for buildings, -5 for wonders, -1 = cannot purchase) */
	buildingHurryCostModifier?: number;
	/** Player's building purchase modifier from policies */
	playerBuildingPurchaseMod?: number;
	/** Player/city-wide hurry modifier from policies/buildings (e.g., Industry policies, Forbidden Palace, Stock Exchange) */
	hurryModifier?: number;
	/** Tech progress percentage (0-100) */
	techProgress?: number;
	/** Enable tech scaling (MOD_BALANCE_PURCHASE_COST_ADJUSTMENTS) - applies in VP */
	enableTechScaling?: boolean;
	/** Whether this is an investment (40% discount) vs full purchase */
	isInvestment?: boolean;
	/** Override constants */
	constants?: GoldPurchaseConstants;
}

/**
 * Calculate gold purchase/investment cost for a building.
 *
 * In VP, building "purchases" are actually investments:
 * - Pay 60% of full purchase cost
 * - Building gets +50% production until completed
 * - Can only invest once per building
 *
 * IMPORTANT: Buildings have TWO types of hurry cost modifiers:
 * 1. Building's base HurryCostModifier (-20% for buildings, -5% for wonders)
 *    - Applied in this function via buildingHurryCostModifier parameter
 * 2. Player/city-wide hurry modifiers (Industry policies, Forbidden Palace, Stock Exchange)
 *    - Applied in getPurchaseCostFromProduction via hurryModifier parameter
 *
 * These stack multiplicatively: cost × (1 + baseModifier) × (1 + playerCityModifier)
 *
 * Note: Tech scaling (MOD_BALANCE_PURCHASE_COST_ADJUSTMENTS) is enabled in VP.
 *
 * @source CvCity.cpp:12143-12203
 *
 * @param productionCost - Building's production cost
 * @param ctx - Game context
 * @param options - Additional modifiers and settings
 * @returns Gold cost or -1 if building cannot be purchased/invested
 */
export function getBuildingPurchaseCost(
	productionCost: number,
	ctx: GameContext,
	options: BuildingPurchaseCostOptions = {}
): number {
	const {
		buildingHurryCostModifier = -20, // Default: all buildings get -20%, wonders get -5%
		playerBuildingPurchaseMod = 0,
		hurryModifier = 0,
		techProgress = 0,
		enableTechScaling = true, // Tech scaling is applied to building investments in VP
		isInvestment = true, // VP default is investment, not purchase
		constants = GOLD_PURCHASE_CONSTANTS_VP
	} = options;

	// If HurryCostModifier is -1, building cannot be purchased
	if (buildingHurryCostModifier === -1) {
		return -1;
	}

	// Base cost from production (includes player/city-wide hurry modifiers)
	let cost = getPurchaseCostFromProduction(productionCost, ctx, hurryModifier, constants);

	// Building's base HurryCostModifier (-20% for buildings, -5% for wonders)
	// iCost *= (100 + iModifier);
	// iCost /= 100;
	if (buildingHurryCostModifier !== 0) {
		cost = Math.floor((cost * (100 + buildingHurryCostModifier)) / 100);
	}

	// Player policy modifier for building purchases
	// iCost *= (100 + GET_PLAYER(getOwner()).GetPlayerPolicies()->GetNumericModifier(POLICYMOD_BUILDING_PURCHASE_COST_MODIFIER));
	// iCost /= 100;
	if (playerBuildingPurchaseMod !== 0) {
		cost = Math.floor((cost * (100 + playerBuildingPurchaseMod)) / 100);
	}

	if (enableTechScaling) {
		// VP: Increase cost based on # of techs researched (1/3 of tech progress, vs 1/2 for units)
		// int iTechProgress = (GET_TEAM(getTeam()).GetTeamTechs()->GetNumTechsKnown() * 100) / GC.getNumTechInfos();
		// iTechProgress /= 3;
		// iCost *= 100 + iTechProgress;
		// iCost /= 100;
		if (techProgress > 0) {
			const techMod = Math.floor(techProgress / 3);
			cost = Math.floor((cost * (100 + techMod)) / 100);
		}
	}

	// VP Investment: Decrease final cost by 40%
	// iCost *= 6;
	// iCost /= 10;
	if (isInvestment) {
		cost = Math.floor((cost * 6) / 10);
	}

	// Round to visible divisor
	cost = floorToDivisor(cost, constants.GOLD_PURCHASE_VISIBLE_DIVISOR);

	// Minimum cost
	return Math.max(constants.GOLD_PURCHASE_VISIBLE_DIVISOR, cost);
}

// =============================================================================
// PROJECT PURCHASE COST
// =============================================================================

/**
 * Calculate gold purchase cost for a project.
 *
 * Projects have the simplest purchase formula - just the base conversion
 * with no additional modifiers (except VP tech progress if applicable).
 *
 * @source CvCity.cpp:12260-12270
 *
 * @param productionCost - Project's production cost
 * @param ctx - Game context
 * @param hurryModifier - Hurry modifier from policies/buildings
 * @param constants - Override constants
 * @returns Gold cost
 */
export function getProjectPurchaseCost(
	productionCost: number,
	ctx: GameContext,
	hurryModifier: number = 0,
	constants: GoldPurchaseConstants = GOLD_PURCHASE_CONSTANTS_VP
): number {
	// Base cost from production
	let cost = getPurchaseCostFromProduction(productionCost, ctx, hurryModifier, constants);

	// Round to visible divisor
	cost = floorToDivisor(cost, constants.GOLD_PURCHASE_VISIBLE_DIVISOR);

	// Minimum cost
	return Math.max(constants.GOLD_PURCHASE_VISIBLE_DIVISOR, cost);
}

// =============================================================================
// GOLD TO PRODUCTION RATIO
// =============================================================================

/**
 * Calculate the gold-to-production ratio at a given production cost.
 *
 * This is useful for visualizing how efficient gold purchases are.
 * Due to the power function, higher production costs yield better ratios.
 *
 * @param productionCost - Production cost to evaluate
 * @param ctx - Game context
 * @param constants - Override constants
 * @returns Gold per production point ratio
 */
export function getGoldToProductionRatio(
	productionCost: number,
	ctx: GameContext,
	constants: GoldPurchaseConstants = GOLD_PURCHASE_CONSTANTS_VP
): number {
	if (productionCost <= 0) {
		return 0;
	}

	const goldCost = getPurchaseCostFromProduction(productionCost, ctx, 0, constants);
	return goldCost / productionCost;
}

/**
 * Calculate what the "break-even" production cost would be for a given gold/prod ratio.
 *
 * @param targetRatio - Desired gold per production ratio
 * @param ctx - Game context
 * @param constants - Override constants
 * @returns Production cost that yields approximately the target ratio
 */
export function getBreakEvenProductionCost(
	targetRatio: number,
	ctx: GameContext,
	constants: GoldPurchaseConstants = GOLD_PURCHASE_CONSTANTS_VP
): number {
	// Using the formula: goldCost = (prod * 30)^0.68
	// ratio = goldCost / prod = (prod * 30)^0.68 / prod
	// This requires numerical approximation since ratio is non-linear
	// For now, use binary search
	let low = 1;
	let high = 10000;

	while (high - low > 1) {
		const mid = Math.floor((low + high) / 2);
		const ratio = getGoldToProductionRatio(mid, ctx, constants);
		if (ratio > targetRatio) {
			low = mid;
		} else {
			high = mid;
		}
	}

	return low;
}

// =============================================================================
// SLIDER CONFIGURATION
// =============================================================================

/**
 * Recommended slider configurations for graph visualization
 */
export const GOLD_PURCHASE_SLIDER_CONFIG = {
	production: {
		min: 10,
		max: 2000,
		default: 200,
		step: 10,
		label: 'Production Cost'
	},
	techProgress: {
		min: 0,
		max: 100,
		default: 0,
		step: 5,
		label: 'Tech Progress (%)'
	},
	exponent: {
		min: 0.5,
		max: 1.0,
		default: 0.68,
		step: 0.01,
		label: 'Exponent (VP=0.68, CP=0.75)'
	},
	goldPerProduction: {
		min: 10,
		max: 50,
		default: 30,
		step: 1,
		label: 'Gold Per Production Multiplier'
	},
	hurryModifier: {
		min: -50,
		max: 50,
		default: 0,
		step: 5,
		label: 'Hurry Modifier (%)'
	}
} as const;
