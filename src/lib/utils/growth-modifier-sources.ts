import type { FoodModifierSource, GrowthModifierSource } from '$lib/types/population-growth';

/**
 * All sources that contribute an additive % growth modifier applied to net food surplus.
 *
 * Order of stacking: all additive, summed into one total in getGrowthMods().
 * Applied AFTER food% modifiers and AFTER consumption is subtracted.
 *
 * @source CvCity.cpp:15992 - CvCity::getGrowthMods()
 */
export const GROWTH_MODIFIER_SOURCES: GrowthModifierSource[] = [
	{
		type: 'WLTKD',
		name: 'We Love the King Day',
		kind: 'wltkd',
		percent: 25,
		description: 'Active WLTKD. WLTKD_GROWTH_MULTIPLIER = 25.'
	},
	{
		type: 'POLICY_RATIONALISM',
		name: 'Rationalism (opener)',
		kind: 'policy',
		percent: 10,
		description: '+10% Growth in all Cities. CityGrowthMod = 10.'
	},
	{
		type: 'POLICY_UNIVERSAL_HEALTHCARE_O',
		name: 'Peace, Land, Bread (Order)',
		kind: 'policy',
		percent: 20,
		description: '+20% Growth in all Cities. CityGrowthMod = 20.'
	},
	{
		type: 'BELIEF_FERTILITY_RITES',
		name: 'Goddess of the Home (Pantheon)',
		kind: 'belief',
		percent: 25,
		description: '+25% Growth. CityGrowthModifier = 25.'
	},
	{
		type: 'BELIEF_DAGDA',
		name: 'Dagda (Celtic Pantheon)',
		kind: 'belief',
		percent: 25,
		description: '+25% Growth and +1 Happiness. CityGrowthModifier = 25.'
	},
	{
		type: 'GA_NILOMETER',
		name: 'Nilometer (Egyptian)',
		kind: 'building',
		percent: 10,
		condition: 'golden-age',
		description: '+10% food during Golden Age. GetGoldenAgeYieldMod(YIELD_FOOD) inside getGrowthMods().'
	},
	{
		type: 'GA_EMANCIPATION',
		name: 'Emancipation (Rationalism branch)',
		kind: 'policy',
		percent: 10,
		condition: 'golden-age',
		description: '+10% Food during Golden Ages. getGoldenAgeYieldMod(YIELD_FOOD) player-level, inside getGrowthMods().'
	}
];

/**
 * All sources that contribute an additive % food yield modifier applied to gross food output.
 *
 * Stacking: additive sum → multiplied against base food yield.
 * Applied BEFORE consumption is subtracted, and BEFORE growth modifiers.
 *
 * @source CvCity.cpp:22931 - CvCity::getYieldRateTimes100() iModifier section
 */
export const FOOD_MODIFIER_SOURCES: FoodModifierSource[] = [
	{
		type: 'BUILDING_TEMPLE_ARTEMIS',
		name: 'Temple of Artemis',
		kind: 'wonder',
		percent: 10,
		description: '+10% Food in all Cities. Empire-wide wonder food yield modifier.'
	},
	{
		type: 'BUILDING_INTERNATIONAL_FINANCE_CENTER',
		name: 'International Finance Center',
		kind: 'building',
		percent: 5,
		description: '+5% Food. National Wonder food yield modifier.'
	},
	{
		type: 'BUILDING_THRONE_ROOM',
		name: 'Throne Room',
		kind: 'building',
		percent: 10,
		condition: 'capital',
		description: '+10% Food. Capital-only building (destroyed on conquest, max 1 per player).'
	},
	{
		type: 'BUILDING_GURDWARA',
		name: 'Gurdwara',
		kind: 'belief',
		percent: 10,
		description: '+10% Food. Belief-unlocked building (faith-purchased only).'
	},
	{
		type: 'BUILDING_HARAPPAN_RESERVOIR',
		name: 'Harappan Reservoir',
		kind: 'building',
		percent: 0,
		percentPerFollower: 1,
		description:
			'+1% Food per majority religion follower. Indian UB replacing Aqueduct. FoodBonusPerCityMajorityFollower = 1.'
	}
];
