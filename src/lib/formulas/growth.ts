import type { EraType, GameContext } from '$lib/types/game-context';
import type { EraThreshold } from '$lib/types/population-growth';

/**
 * Growth-threshold modifiers that are not represented in the shared GameContext.
 *
 * @source CvPlayer.cpp:44981 - CvPlayer::getGrowthThreshold()
 */
export interface GrowthThresholdOptions {
	isMajorCiv?: boolean;
	isHuman?: boolean;
	playerGrowthPercent?: number;
	growthPerEraModifier?: number;
	aiGrowthPercent?: number;
	aiGrowthPerEraModifier?: number;
}

/**
 * Calculate the food threshold needed to grow from population N to N + 1.
 *
 * @source CvPlayer.cpp:44981 - CvPlayer::getGrowthThreshold()
 *
 * @constants
 * - BASE_CITY_GROWTH_THRESHOLD: 15 (GD_INT_GET)
 * - CITY_GROWTH_MULTIPLIER: 12.0 (GD_FLOAT_GET, VP value)
 * - CITY_GROWTH_EXPONENT: 2.22 (GD_FLOAT_GET, VP value)
 *
 * @param currentPopulation - Current city population before growth
 * @param ctx - Game context for growth modifiers
 * @param options - Optional handicap/AI growth modifiers
 * @returns Food threshold required for the next citizen
 */
export function getGrowthThreshold(
	currentPopulation: number,
	ctx: GameContext,
	options: GrowthThresholdOptions = {}
): number {
	if (currentPopulation <= 0) {
		return 1;
	}

	const {
		isMajorCiv = true,
		isHuman = true,
		playerGrowthPercent = 100,
		growthPerEraModifier = 0,
		aiGrowthPercent = ctx.handicap.aiGrowthPercent,
		aiGrowthPerEraModifier = 0
	} = options;

	let baseThreshold = ctx.constants.BASE_CITY_GROWTH_THRESHOLD;
	let extraPopThreshold = Math.floor((currentPopulation - 1) * ctx.constants.CITY_GROWTH_MULTIPLIER);

	baseThreshold += extraPopThreshold;
	extraPopThreshold = Math.floor(Math.pow(currentPopulation - 1, ctx.constants.CITY_GROWTH_EXPONENT));

	let threshold = baseThreshold + extraPopThreshold;
	threshold = Math.floor((threshold * ctx.gameSpeed.growthPercent) / 100);
	threshold = Math.floor((threshold * ctx.startEra.growthPercent) / 100);

	if (isMajorCiv) {
		threshold = Math.floor((threshold * playerGrowthPercent) / 100);
		threshold = Math.floor((threshold * Math.max(0, growthPerEraModifier * ctx.currentEra.id + 100)) / 100);

		if (!isHuman) {
			threshold = Math.floor((threshold * aiGrowthPercent) / 100);
			threshold = Math.floor((threshold * Math.max(0, aiGrowthPerEraModifier * ctx.currentEra.id + 100)) / 100);
		}
	}

	return Math.max(1, threshold);
}

/**
 * Effective food spent to birth citizen X after previous-growth food carryover.
 *
 * The carried food comes from the previous growth event, so the threshold for
 * citizen X is reduced by a percentage of the threshold used to birth citizen X - 1.
 *
 * @source CvCity.cpp:31120 - CvCity::doGrowth()
 *
 * @param targetCitizen - The citizen being born (2 = growth from 1 to 2)
 * @param carryoverPercent - Total carried food percentage from active buildings
 * @param ctx - Game context for the growth formula
 * @param options - Optional handicap/AI growth modifiers
 * @returns Net food required after carried food is applied
 */
export function getEffectiveFoodForCitizenBirth(
	targetCitizen: number,
	carryoverPercent: number,
	ctx: GameContext,
	options: GrowthThresholdOptions = {}
): number {
	if (targetCitizen <= 1) {
		return 0;
	}

	const currentThreshold = getGrowthThreshold(targetCitizen - 1, ctx, options);
	if (targetCitizen === 2) {
		return currentThreshold;
	}

	const previousThreshold = getGrowthThreshold(targetCitizen - 2, ctx, options);
	const carriedFood = Math.floor((previousThreshold * Math.max(0, carryoverPercent)) / 100);

	return Math.max(0, currentThreshold - carriedFood);
}

/**
 * VP era-scaling multiplier used by citizen-birth instant yields.
 * Ancient and Classical both scale as 1, then each later era increases by 1.
 *
 * @source CvPlayer.cpp:25395 - int iEra = max<int>(1, GetCurrentEra())
 */
export function getBirthYieldEraMultiplier(eraId: number): number {
	return Math.max(1, eraId);
}

/**
 * Resolve which era applies to a given citizen birth based on step thresholds.
 *
 * Thresholds are interpreted against the citizen being born, e.g. a threshold of
 * 12 -> Medieval means citizen 12 and above use the Medieval multiplier until the
 * next threshold overrides it.
 */
export function getEraTypeForCitizenBirth(targetCitizen: number, thresholds: EraThreshold[], fallbackEra: EraType): EraType {
	let resolved = fallbackEra;

	for (const threshold of thresholds) {
		if (threshold.citizen <= targetCitizen) {
			resolved = threshold.eraType;
		}
	}

	return resolved;
}