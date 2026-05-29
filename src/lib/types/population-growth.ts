import type { TechReference } from '$lib/types/civilopedia';
import type { EraType } from '$lib/types/game-context';

export type GrowthYieldType =
	| 'YIELD_FOOD'
	| 'YIELD_PRODUCTION'
	| 'YIELD_GOLD'
	| 'YIELD_SCIENCE'
	| 'YIELD_CULTURE'
	| 'YIELD_FAITH'
	| 'YIELD_GOLDEN_AGE_POINTS'
	| 'YIELD_GREAT_PEOPLE_POINTS';

export type BirthSourceKind = 'building' | 'policy' | 'belief';

export type BirthSourceScope = 'city' | 'player' | 'capital' | 'holy-city';

export interface EraThreshold {
	citizen: number;
	eraType: EraType;
}

export interface FlatBirthYieldFormula {
	kind: 'flat';
	yieldType: GrowthYieldType;
	amount: number;
	eraScaled: boolean;
}

export interface CityOutputBirthYieldFormula {
	kind: 'city-output-percent';
	yieldType: GrowthYieldType;
	percent: number;
}

export type BirthYieldFormula = FlatBirthYieldFormula | CityOutputBirthYieldFormula;

export interface PopulationGrowthBuildingSource {
	type: string;
	name: string;
	buildingClass: string;
	prereqTech?: TechReference;
	isUnique: boolean;
	isWonder: boolean;
	isNationalWonder: boolean;
	unlockedByBelief: boolean;
	civilizationName?: string;
	carryoverPercent: number;
	birthYields: BirthYieldFormula[];
	defaultEnabled: boolean;
}

export interface PopulationGrowthGlobalSource {
	type: string;
	name: string;
	kind: BirthSourceKind;
	scope: BirthSourceScope;
	birthYields: FlatBirthYieldFormula[];
	defaultEnabled: boolean;
	description: string;
}

/**
 * A source that contributes an additive % to the growth modifier.
 * Applied to the net food surplus (after consumption) each turn.
 * @source CvCity.cpp:15992 - CvCity::getGrowthMods()
 */
export interface GrowthModifierSource {
	type: string;
	name: string;
	kind: 'policy' | 'belief' | 'building' | 'wltkd';
	percent: number;
	/** If set, this source only applies when the stated condition is active. */
	condition?: 'golden-age';
	description: string;
}

/**
 * A source that contributes an additive % to the food yield modifier.
 * Applied to the GROSS food output, before subtracting consumption.
 * @source CvCity.cpp:22931 - CvCity::getYieldRateTimes100() iModifier section
 */
export interface FoodModifierSource {
	type: string;
	name: string;
	kind: 'policy' | 'belief' | 'wonder' | 'building';
	/** Flat % bonus. 0 if this source scales per follower instead. */
	percent: number;
	/** For Harappan Reservoir: +1% per majority follower. */
	percentPerFollower?: number;
	condition?: 'capital';
	description: string;
}

export interface BirthYieldBreakdown {
	yieldType: GrowthYieldType;
	amount: number;
	contributions: Array<{
		sourceType: string;
		sourceName: string;
		amount: number;
	}>;
}