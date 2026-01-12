/**
 * Game context types for Vox Populi formula calculations
 *
 * These interfaces represent the game state parameters that affect
 * calculations like production costs, growth thresholds, and yields.
 * Values are based on Vox Populi defaults.
 */

// =============================================================================
// GAME SPEED
// =============================================================================

export interface GameSpeedInfo {
	type: GameSpeedType;
	/** Modifier for population growth (default 100 for Standard) */
	growthPercent: number;
	/** Modifier for unit production (default 100 for Standard) */
	trainPercent: number;
	/** Modifier for building production (default 100 for Standard) */
	constructPercent: number;
	/** Modifier for wonder production (default 100 for Standard) */
	createPercent: number;
	/** Modifier for technology research (default 100 for Standard) */
	researchPercent: number;
	/** Modifier for gold costs (default 100 for Standard) */
	goldPercent: number;
	/** Modifier for hurry costs (default 100 for Standard) */
	hurryPercent: number;
	/** Modifier for culture costs (default 100 for Standard) */
	culturePercent: number;
	/** Modifier for faith costs (default 100 for Standard) */
	faithPercent: number;
}

export type GameSpeedType = 'GAMESPEED_QUICK' | 'GAMESPEED_STANDARD' | 'GAMESPEED_EPIC' | 'GAMESPEED_MARATHON';

export const GAME_SPEED_DEFAULTS: Record<GameSpeedType, GameSpeedInfo> = {
	GAMESPEED_QUICK: {
		type: 'GAMESPEED_QUICK',
		growthPercent: 67,
		trainPercent: 67,
		constructPercent: 67,
		createPercent: 67,
		researchPercent: 67,
		goldPercent: 67,
		hurryPercent: 67,
		culturePercent: 67,
		faithPercent: 67
	},
	GAMESPEED_STANDARD: {
		type: 'GAMESPEED_STANDARD',
		growthPercent: 100,
		trainPercent: 100,
		constructPercent: 100,
		createPercent: 100,
		researchPercent: 100,
		goldPercent: 100,
		hurryPercent: 100,
		culturePercent: 100,
		faithPercent: 100
	},
	GAMESPEED_EPIC: {
		type: 'GAMESPEED_EPIC',
		growthPercent: 150,
		trainPercent: 150,
		constructPercent: 150,
		createPercent: 150,
		researchPercent: 150,
		goldPercent: 150,
		hurryPercent: 150,
		culturePercent: 150,
		faithPercent: 150
	},
	GAMESPEED_MARATHON: {
		type: 'GAMESPEED_MARATHON',
		growthPercent: 300,
		trainPercent: 300,
		constructPercent: 300,
		createPercent: 300,
		researchPercent: 300,
		goldPercent: 300,
		hurryPercent: 300,
		culturePercent: 300,
		faithPercent: 300
	}
};

// =============================================================================
// ERA
// =============================================================================

export interface EraInfo {
	id: number;
	type: EraType;
	name: string;
	/** Modifier for growth when starting in this era */
	growthPercent: number;
	/** Modifier for training when starting in this era */
	trainPercent: number;
	/** Modifier for construction when starting in this era */
	constructPercent: number;
	/** Modifier for research when starting in this era */
	researchPercent: number;
}

export type EraType =
	| 'ERA_ANCIENT'
	| 'ERA_CLASSICAL'
	| 'ERA_MEDIEVAL'
	| 'ERA_RENAISSANCE'
	| 'ERA_INDUSTRIAL'
	| 'ERA_MODERN'
	| 'ERA_ATOMIC'
	| 'ERA_INFORMATION';

export const ERA_DEFAULTS: Record<EraType, EraInfo> = {
	ERA_ANCIENT: {
		id: 0,
		type: 'ERA_ANCIENT',
		name: 'Ancient Era',
		growthPercent: 100,
		trainPercent: 100,
		constructPercent: 100,
		researchPercent: 100
	},
	ERA_CLASSICAL: {
		id: 1,
		type: 'ERA_CLASSICAL',
		name: 'Classical Era',
		growthPercent: 100,
		trainPercent: 100,
		constructPercent: 100,
		researchPercent: 100
	},
	ERA_MEDIEVAL: {
		id: 2,
		type: 'ERA_MEDIEVAL',
		name: 'Medieval Era',
		growthPercent: 100,
		trainPercent: 100,
		constructPercent: 100,
		researchPercent: 100
	},
	ERA_RENAISSANCE: {
		id: 3,
		type: 'ERA_RENAISSANCE',
		name: 'Renaissance Era',
		growthPercent: 100,
		trainPercent: 100,
		constructPercent: 100,
		researchPercent: 100
	},
	ERA_INDUSTRIAL: {
		id: 4,
		type: 'ERA_INDUSTRIAL',
		name: 'Industrial Era',
		growthPercent: 100,
		trainPercent: 100,
		constructPercent: 100,
		researchPercent: 100
	},
	ERA_MODERN: {
		id: 5,
		type: 'ERA_MODERN',
		name: 'Modern Era',
		growthPercent: 100,
		trainPercent: 100,
		constructPercent: 100,
		researchPercent: 100
	},
	ERA_ATOMIC: {
		id: 6,
		type: 'ERA_ATOMIC',
		name: 'Atomic Era',
		growthPercent: 100,
		trainPercent: 100,
		constructPercent: 100,
		researchPercent: 100
	},
	ERA_INFORMATION: {
		id: 7,
		type: 'ERA_INFORMATION',
		name: 'Information Era',
		growthPercent: 100,
		trainPercent: 100,
		constructPercent: 100,
		researchPercent: 100
	}
};

// =============================================================================
// HANDICAP (DIFFICULTY)
// =============================================================================

export interface HandicapInfo {
	id: number;
	type: HandicapType;
	name: string;
	/** AI production bonus percent */
	aiProductionPercent: number;
	/** AI research bonus percent */
	aiResearchPercent: number;
	/** AI growth bonus percent */
	aiGrowthPercent: number;
	/** Player research modifier */
	playerResearchPercent: number;
	/** Player happiness modifier */
	playerHappinessDefault: number;
}

export type HandicapType =
	| 'HANDICAP_SETTLER'
	| 'HANDICAP_CHIEFTAIN'
	| 'HANDICAP_WARLORD'
	| 'HANDICAP_PRINCE'
	| 'HANDICAP_KING'
	| 'HANDICAP_EMPEROR'
	| 'HANDICAP_IMMORTAL'
	| 'HANDICAP_DEITY';

export const HANDICAP_DEFAULTS: Record<HandicapType, HandicapInfo> = {
	HANDICAP_SETTLER: {
		id: 0,
		type: 'HANDICAP_SETTLER',
		name: 'Settler',
		aiProductionPercent: 60,
		aiResearchPercent: 60,
		aiGrowthPercent: 60,
		playerResearchPercent: 100,
		playerHappinessDefault: 15
	},
	HANDICAP_CHIEFTAIN: {
		id: 1,
		type: 'HANDICAP_CHIEFTAIN',
		name: 'Chieftain',
		aiProductionPercent: 75,
		aiResearchPercent: 75,
		aiGrowthPercent: 75,
		playerResearchPercent: 100,
		playerHappinessDefault: 12
	},
	HANDICAP_WARLORD: {
		id: 2,
		type: 'HANDICAP_WARLORD',
		name: 'Warlord',
		aiProductionPercent: 85,
		aiResearchPercent: 85,
		aiGrowthPercent: 85,
		playerResearchPercent: 100,
		playerHappinessDefault: 12
	},
	HANDICAP_PRINCE: {
		id: 3,
		type: 'HANDICAP_PRINCE',
		name: 'Prince',
		aiProductionPercent: 100,
		aiResearchPercent: 100,
		aiGrowthPercent: 100,
		playerResearchPercent: 100,
		playerHappinessDefault: 9
	},
	HANDICAP_KING: {
		id: 4,
		type: 'HANDICAP_KING',
		name: 'King',
		aiProductionPercent: 115,
		aiResearchPercent: 115,
		aiGrowthPercent: 115,
		playerResearchPercent: 100,
		playerHappinessDefault: 9
	},
	HANDICAP_EMPEROR: {
		id: 5,
		type: 'HANDICAP_EMPEROR',
		name: 'Emperor',
		aiProductionPercent: 130,
		aiResearchPercent: 130,
		aiGrowthPercent: 130,
		playerResearchPercent: 100,
		playerHappinessDefault: 9
	},
	HANDICAP_IMMORTAL: {
		id: 6,
		type: 'HANDICAP_IMMORTAL',
		name: 'Immortal',
		aiProductionPercent: 150,
		aiResearchPercent: 150,
		aiGrowthPercent: 150,
		playerResearchPercent: 100,
		playerHappinessDefault: 9
	},
	HANDICAP_DEITY: {
		id: 7,
		type: 'HANDICAP_DEITY',
		name: 'Deity',
		aiProductionPercent: 170,
		aiResearchPercent: 170,
		aiGrowthPercent: 170,
		playerResearchPercent: 100,
		playerHappinessDefault: 9
	}
};

// =============================================================================
// GAME CONSTANTS
// =============================================================================

/**
 * Game constants from GD_INT_GET and GD_FLOAT_GET macros
 * These are the VP defaults that can be overridden for visualization
 */
export interface GameConstants {
	// Population growth
	BASE_CITY_GROWTH_THRESHOLD: number;
	CITY_GROWTH_MULTIPLIER: number;
	CITY_GROWTH_EXPONENT: number;

	// Unit production
	UNIT_PRODUCTION_PERCENT: number;

	// Gold purchase
	GOLD_PURCHASE_VISIBLE_DIVISOR: number;
	GOLD_PURCHASE_MULTIPLIER: number;

	// Building production
	BUILDING_PRODUCTION_PERCENT: number;

	// Combat
	MAX_HIT_POINTS: number;
	COMBAT_DAMAGE: number;
}

export const GAME_CONSTANTS_VP_DEFAULTS: GameConstants = {
	// Population growth (VP values)
	BASE_CITY_GROWTH_THRESHOLD: 15,
	CITY_GROWTH_MULTIPLIER: 12.0,
	CITY_GROWTH_EXPONENT: 2.22,

	// Unit production
	UNIT_PRODUCTION_PERCENT: 100,

	// Gold purchase
	GOLD_PURCHASE_VISIBLE_DIVISOR: 10,
	GOLD_PURCHASE_MULTIPLIER: 250, // Percentage (2.5x)

	// Building production
	BUILDING_PRODUCTION_PERCENT: 100,

	// Combat
	MAX_HIT_POINTS: 100,
	COMBAT_DAMAGE: 30
};

// =============================================================================
// FULL GAME CONTEXT
// =============================================================================

/**
 * Complete game context for formula calculations
 */
export interface GameContext {
	gameSpeed: GameSpeedInfo;
	startEra: EraInfo;
	currentEra: EraInfo;
	handicap: HandicapInfo;
	constants: GameConstants;
}

/**
 * Create a default game context (Standard speed, Ancient start, Prince difficulty)
 */
export function createDefaultGameContext(): GameContext {
	return {
		gameSpeed: GAME_SPEED_DEFAULTS.GAMESPEED_STANDARD,
		startEra: ERA_DEFAULTS.ERA_ANCIENT,
		currentEra: ERA_DEFAULTS.ERA_ANCIENT,
		handicap: HANDICAP_DEFAULTS.HANDICAP_PRINCE,
		constants: { ...GAME_CONSTANTS_VP_DEFAULTS }
	};
}

// =============================================================================
// MODIFIER UTILITIES
// =============================================================================

/**
 * Apply a percentage modifier using C++ integer math semantics
 * Equivalent to: value *= (100 + modifier); value /= 100;
 */
export function applyModifier(value: number, modifier: number): number {
	return Math.floor((value * (100 + modifier)) / 100);
}

/**
 * Apply a direct percentage multiplier
 * Equivalent to: value *= percent; value /= 100;
 */
export function applyPercent(value: number, percent: number): number {
	return Math.floor((value * percent) / 100);
}
