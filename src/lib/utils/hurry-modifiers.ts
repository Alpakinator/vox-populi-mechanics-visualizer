/**
 * Utilities for parsing and managing hurry cost modifiers from buildings and policies.
 * 
 * Hurry modifiers reduce the gold cost of purchasing/investing in units and buildings.
 * They come from several sources:
 * - Buildings (global): Forbidden Palace (-15%)
 * - Buildings (local): Stock Exchange (-20%), Rialto District (-5% local + -10% empire)
 * - Policies: Industry branch (-5% per policy, up to -30% for all 6 policies)
 */

import type { Building } from '$lib/types/civilopedia';

export interface HurryModifierSource {
	/** Building or policy type identifier */
	type: string;
	/** Display name */
	name: string;
	/** Modifier value (negative = discount, e.g., -15 = -15%) */
	modifier: number;
	/** Whether this is a local (city-only) or empire-wide modifier */
	scope: 'local' | 'empire';
	/** Help text describing the modifier */
	description: string;
}

/**
 * Parse hurry modifiers from a building's Help text.
 * 
 * Looks for patterns like:
 * - "-15% [ICON_GOLD] Gold cost for Purchase or Investment in all Cities" (empire-wide)
 * - "-20% [ICON_GOLD] Gold cost for Purchase or Investment" (local)
 * 
 * @param building - Building data from civilopedia
 * @returns Array of hurry modifier sources found in this building
 */
export function parseHurryModifiersFromBuilding(building: Building): HurryModifierSource[] {
	const modifiers: HurryModifierSource[] = [];
	
	if (!building.Help) {
		return modifiers;
	}

	// Pattern 1: Local modifier
	// "-20% [ICON_GOLD] Gold cost for Purchase or Investment"
	const localPattern = /(-?\d+)%\s*\[ICON_GOLD\]\s*Gold cost for Purchase or Investment(?!\s+in all Cities)/gi;
	let match;
	
	while ((match = localPattern.exec(building.Help)) !== null) {
		const modifier = parseInt(match[1], 10);
		modifiers.push({
			type: building.Type,
			name: building.Name,
			modifier,
			scope: 'local',
			description: `${modifier}% gold cost for purchases/investments in this city`
		});
	}

	// Pattern 2: Empire-wide modifier
	// "-15% [ICON_GOLD] Gold cost for Purchase or Investment in all Cities"
	const empirePattern = /(-?\d+)%\s*\[ICON_GOLD\]\s*Gold cost for Purchase or Investment in all Cities/gi;
	
	while ((match = empirePattern.exec(building.Help)) !== null) {
		const modifier = parseInt(match[1], 10);
		modifiers.push({
			type: building.Type,
			name: building.Name,
			modifier,
			scope: 'empire',
			description: `${modifier}% gold cost for purchases/investments in all cities`
		});
	}

	return modifiers;
}

/**
 * Find all buildings that provide hurry modifiers.
 * 
 * @param buildings - Array of all buildings from civilopedia
 * @returns Map of building type to hurry modifier sources
 */
export function findHurryModifierBuildings(buildings: Building[]): Map<string, HurryModifierSource[]> {
	const map = new Map<string, HurryModifierSource[]>();
	
	for (const building of buildings) {
		const modifiers = parseHurryModifiersFromBuilding(building);
		if (modifiers.length > 0) {
			map.set(building.Type, modifiers);
		}
	}
	
	return map;
}

/**
 * Calculate total hurry modifier from enabled sources.
 * 
 * @param enabledSources - Set of enabled source type identifiers
 * @param allSources - Map of all available hurry modifier sources
 * @param scope - Filter by scope ('local', 'empire', or 'all')
 * @returns Total hurry modifier percentage
 */
export function calculateTotalHurryModifier(
	enabledSources: Set<string>,
	allSources: Map<string, HurryModifierSource[]>,
	scope: 'local' | 'empire' | 'all' = 'all'
): number {
	let total = 0;
	
	for (const [sourceType, modifiers] of allSources) {
		if (!enabledSources.has(sourceType)) {
			continue;
		}
		
		for (const modifier of modifiers) {
			if (scope === 'all' || modifier.scope === scope) {
				total += modifier.modifier;
			}
		}
	}
	
	return total;
}

/**
 * Predefined hurry modifier sources for the Industry policy branch.
 * Each policy in Industry provides -5% hurry cost.
 */
export const INDUSTRY_POLICY_MODIFIERS: HurryModifierSource[] = [
	{
		type: 'POLICY_COMMERCE', // Opener
		name: 'Industry (Opener)',
		modifier: -5,
		scope: 'empire',
		description: '-5% gold cost for purchases/investments'
	},
	{
		type: 'POLICY_CARAVANS', // Free Trade
		name: 'Free Trade',
		modifier: -5,
		scope: 'empire',
		description: '-5% gold cost for purchases/investments'
	},
	{
		type: 'POLICY_TRADE_UNIONS', // Division of Labor
		name: 'Division of Labor',
		modifier: -5,
		scope: 'empire',
		description: '-5% gold cost for purchases/investments'
	},
	{
		type: 'POLICY_ENTREPRENEURSHIP',
		name: 'Entrepreneurship',
		modifier: -5,
		scope: 'empire',
		description: '-5% gold cost for purchases/investments'
	},
	{
		type: 'POLICY_MERCANTILISM',
		name: 'Mercantilism',
		modifier: -5,
		scope: 'empire',
		description: '-5% gold cost for purchases/investments'
	},
	{
		type: 'POLICY_PROTECTIONISM',
		name: 'Protectionism',
		modifier: -5,
		scope: 'empire',
		description: '-5% gold cost for purchases/investments'
	},
	{
		type: 'POLICY_COMMERCE_FINISHER', // Finisher
		name: 'Industry (Finisher)',
		modifier: -5,
		scope: 'empire',
		description: '-5% gold cost for purchases/investments'
	}
];

/**
 * Get all Industry policy modifiers as a map.
 */
export function getIndustryPolicyModifiers(): Map<string, HurryModifierSource[]> {
	const map = new Map<string, HurryModifierSource[]>();
	
	for (const policy of INDUSTRY_POLICY_MODIFIERS) {
		map.set(policy.type, [policy]);
	}
	
	return map;
}
