import civilopediaData from '$lib/data/civilopedia_export.json';
import type { Belief, Building, Policy } from '$lib/types/civilopedia';
import type {
	BirthSourceScope,
	BirthYieldFormula,
	FlatBirthYieldFormula,
	GrowthYieldType,
	PopulationGrowthBuildingSource,
	PopulationGrowthGlobalSource
} from '$lib/types/population-growth';
import { stripColorTags } from '$lib/utils/civilopedia-parser';

const ICON_TO_YIELD_TYPE: Record<string, GrowthYieldType | undefined> = {
	ICON_FOOD: 'YIELD_FOOD',
	ICON_PRODUCTION: 'YIELD_PRODUCTION',
	ICON_GOLD: 'YIELD_GOLD',
	ICON_RESEARCH: 'YIELD_SCIENCE',
	ICON_CULTURE: 'YIELD_CULTURE',
	ICON_PEACE: 'YIELD_FAITH',
	ICON_GOLDEN_AGE: 'YIELD_GOLDEN_AGE_POINTS',
	ICON_GREAT_PEOPLE: 'YIELD_GREAT_PEOPLE_POINTS'
};

type BuildingRecord = Building & { Civilizations?: Array<{ Name: string }> };
type BeliefRecord = Belief & { Summary?: string };
type PolicyRecord = Policy & { Summary?: string };

function normalizeText(text: string | undefined): string {
	if (!text) {
		return '';
	}

	return stripColorTags(text)
		.replace(/\[NEWLINE\]/g, ' ')
		.replace(/\[TAB\]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function parseCarryoverPercent(helpText: string): number {
	const match = normalizeText(helpText).match(/\+(\d+)%\s*\[ICON_FOOD\]\s*Food is carried over when City grows/i);
	return match ? parseInt(match[1], 10) : 0;
}

function getBirthScope(fragment: string, defaultScope: BirthSourceScope): BirthSourceScope {
	if (/in any city/i.test(fragment)) {
		return 'player';
	}

	if (/capital/i.test(fragment) && /citizen is born/i.test(fragment)) {
		return 'capital';
	}

	if (/holy city/i.test(fragment) && /citizen is born/i.test(fragment)) {
		return 'holy-city';
	}

	if (/in this city/i.test(fragment)) {
		return 'city';
	}

	return defaultScope;
}

function extractBirthRewardText(fragment: string): string {
	const colonMatch = fragment.match(/Citizen is born(?: in (?:this City|any City))?\s*:\s*(.*)$/i);
	if (colonMatch) {
		return colonMatch[1].trim();
	}

	const beforeMatch = fragment.match(/^(.*?)\s+when a \[ICON_CITIZEN\] Citizen is born(?: in (?:this City|any City))?/i);
	if (beforeMatch) {
		return beforeMatch[1].trim();
	}

	return '';
}

function parseBirthYieldFormulas(fragment: string): BirthYieldFormula[] {
	const eraScaled = /scaling with era/i.test(fragment);
	let rewardText = extractBirthRewardText(fragment);
	if (!rewardText) {
		return [];
	}

	rewardText = rewardText.replace(/,?\s*scaling with era/gi, '').trim();

	const formulas: BirthYieldFormula[] = [];
	const outputRegex = /\[?(ICON_[A-Z_]+)\]?[^%]*?equal to\s*(\d+)%\s*of City output/gi;
	rewardText = rewardText.replace(outputRegex, (_match, icon: string, percent: string) => {
		const yieldType = ICON_TO_YIELD_TYPE[icon];
		if (yieldType) {
			formulas.push({
				kind: 'city-output-percent',
				yieldType,
				percent: parseInt(percent, 10)
			});
		}
		return ' ';
	});

	const tokenRegex = /(\+?\d+)?\s*\[(ICON_[A-Z_]+)\]/g;
	let currentAmount: number | null = null;
	let match: RegExpExecArray | null = tokenRegex.exec(rewardText);

	while (match) {
		if (match[1]) {
			currentAmount = parseInt(match[1].replace('+', ''), 10);
		}

		const yieldType = ICON_TO_YIELD_TYPE[match[2]];
		if (yieldType && currentAmount !== null) {
			formulas.push({
				kind: 'flat',
				yieldType,
				amount: currentAmount,
				eraScaled
			});
		}

		match = tokenRegex.exec(rewardText);
	}

	return formulas;
}

function findBirthFragments(text: string): string[] {
	const fragments = stripColorTags(text)
		.replace(/\[TAB\]/g, ' ')
		.replace(/\[NEWLINE\]/g, '\n')
		.split(/\n+/)
		.flatMap((line) => line.split(/\.\s+/))
		.map((fragment) => fragment.replace(/\s+/g, ' ').trim())
		.filter(Boolean);

	return fragments.filter((fragment) => /Citizen is born/i.test(fragment));
}

function collectBirthFragments(...texts: Array<string | undefined>): string[] {
	return Array.from(
		new Set(
			texts.flatMap((text) => findBirthFragments(text ?? ''))
		)
	);
}

function dedupeBirthYieldFormulas(formulas: BirthYieldFormula[]): BirthYieldFormula[] {
	const seen = new Set<string>();
	const deduped: BirthYieldFormula[] = [];

	for (const formula of formulas) {
		const key =
			formula.kind === 'flat'
				? `${formula.kind}:${formula.yieldType}:${formula.amount}:${formula.eraScaled}`
				: `${formula.kind}:${formula.yieldType}:${formula.percent}`;

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		deduped.push(formula);
	}

	return deduped;
}

function buildPopulationGrowthBuildingSources(): PopulationGrowthBuildingSource[] {
	const buildings = (civilopediaData as { buildings: BuildingRecord[] }).buildings;
	const results: PopulationGrowthBuildingSource[] = [];

	// Belief-only or unique buildings that should still be enabled by default.
	const FORCE_ENABLED = new Set(['BUILDING_MANDIR']);

	// Unique buildings that are graph-identical to the non-unique building in the same class.
	// Qullqa = Granary (same carryover, no birth yields)
	// Bimaristan = University (same 25% science on birth)
	// Piazza San Marco = National Epic (same +15 culture×era on birth)
	// Marae = Council (same +5 science×era on birth; building-completion yield not tracked here)
	const HIDE_REDUNDANT = new Set([
		'BUILDING_QULLQA',
		'BUILDING_BIMARISTAN',
		'BUILDING_PIAZZA_SAN_MARCO',
		'BUILDING_MARAE'
	]);

	for (const building of buildings) {
		if (HIDE_REDUNDANT.has(building.Type)) {
			continue;
		}
		const carryoverPercent = parseCarryoverPercent(building.Help);
		const birthFragments = collectBirthFragments(building.Help);
		const birthYields = dedupeBirthYieldFormulas(
			birthFragments.flatMap((fragment) => parseBirthYieldFormulas(fragment))
		);

		if (carryoverPercent <= 0 && birthYields.length === 0) {
			continue;
		}

		const isUnique = !!(building.Civilizations && building.Civilizations.length > 0);
		const isBeliefOnly = building.UnlockedByBelief && building.Cost <= 0;
		results.push({
			type: building.Type,
			name: stripColorTags(building.Name),
			buildingClass: building.BuildingClass,
			prereqTech: building.PrereqTech,
			isUnique,
			isWonder: building.IsWonder,
			isNationalWonder: building.IsNationalWonder,
			unlockedByBelief: isBeliefOnly,
			civilizationName: building.Civilizations?.[0]?.Name,
			carryoverPercent,
			birthYields,
			defaultEnabled: FORCE_ENABLED.has(building.Type) || (!isUnique && !building.IsWonder && !building.IsNationalWonder && !isBeliefOnly)
		});
	}

	results.sort((left, right) => left.name.localeCompare(right.name));
	return results;
}

function buildPopulationGrowthGlobalSources(): PopulationGrowthGlobalSource[] {
	const policies = (civilopediaData as unknown as { policies: PolicyRecord[] }).policies;
	const beliefs = (civilopediaData as unknown as { beliefs: BeliefRecord[] }).beliefs;
	const results: PopulationGrowthGlobalSource[] = [];

	// Policies and beliefs to enable by default.
	const FORCE_ENABLED = new Set(['POLICY_LIBERTY', 'POLICY_UNIVERSAL_HEALTHCARE_F']);

	for (const policy of policies) {
		const birthFragments = collectBirthFragments(policy.Help, policy.Summary);
		if (birthFragments.length === 0) {
			continue;
		}

		const birthYields = dedupeBirthYieldFormulas(
			birthFragments.flatMap((fragment) => parseBirthYieldFormulas(fragment))
		).filter(
			(formula): formula is FlatBirthYieldFormula => formula.kind === 'flat'
		);
		if (birthYields.length === 0) {
			continue;
		}

		results.push({
			type: policy.Type,
			name: stripColorTags(policy.Name),
			kind: 'policy',
			scope: getBirthScope(birthFragments[0], 'player'),
			birthYields,
			defaultEnabled: FORCE_ENABLED.has(policy.Type),
			description: normalizeText(policy.Help || policy.Summary)
		});
	}

	for (const belief of beliefs) {
		const birthFragments = collectBirthFragments(belief.Help, belief.Summary);
		if (birthFragments.length === 0) {
			continue;
		}

		const birthYields = dedupeBirthYieldFormulas(
			birthFragments.flatMap((fragment) => parseBirthYieldFormulas(fragment))
		).filter(
			(formula): formula is FlatBirthYieldFormula => formula.kind === 'flat'
		);
		if (birthYields.length === 0) {
			continue;
		}

		results.push({
			type: belief.Type,
			name: stripColorTags(belief.Name),
			kind: 'belief',
			scope: getBirthScope(birthFragments[0], 'player'),
			birthYields,
			defaultEnabled: false,
			description: normalizeText(belief.Help || belief.Summary)
		});
	}

	results.sort((left, right) => left.name.localeCompare(right.name));
	return results;
}

export const POPULATION_GROWTH_BUILDING_SOURCES = buildPopulationGrowthBuildingSources();
export const POPULATION_GROWTH_GLOBAL_SOURCES = buildPopulationGrowthGlobalSources();

export const POPULATION_GROWTH_OUTPUT_YIELDS = Array.from(
	new Set(
		POPULATION_GROWTH_BUILDING_SOURCES.flatMap((source) =>
			source.birthYields
				.filter((formula): formula is Extract<BirthYieldFormula, { kind: 'city-output-percent' }> => formula.kind === 'city-output-percent')
				.map((formula) => formula.yieldType)
		)
	)
);