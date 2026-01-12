/**
 * Utility functions for parsing data from civilopedia_export.json
 */

/**
 * Extract production and gold cost from a unit/building Help text
 *
 * @example
 * Help: "...Cost: 70 [ICON_PRODUCTION] / 150 [ICON_PEACE]..."
 * Returns: { production: 70, gold: 150 }
 *
 * @param helpText - The Help field from civilopedia data
 * @returns Parsed costs or undefined if not found
 */
export function parseCostFromHelp(helpText: string): { production: number; gold: number } | undefined {
	// Pattern: "Cost: XX [ICON_PRODUCTION] / YY [ICON_PEACE]"
	// Numbers may contain commas (e.g., "1,300")
	const match = helpText.match(/Cost:\s*([\d,]+)\s*\[ICON_PRODUCTION\]\s*\/\s*([\d,]+)\s*\[ICON_PEACE\]/);
	if (match) {
		return {
			production: parseInt(match[1].replace(/,/g, ''), 10),
			gold: parseInt(match[2].replace(/,/g, ''), 10)
		};
	}
	return undefined;
}

/**
 * Extract combat strength from Help text
 *
 * @param helpText - The Help field from civilopedia data
 * @returns Combat strength or undefined
 */
export function parseCombatFromHelp(helpText: string): number | undefined {
	const match = helpText.match(/\[ICON_STRENGTH\]\s*Strength:\s*(\d+)/);
	return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Extract ranged strength from Help text
 *
 * @param helpText - The Help field from civilopedia data
 * @returns Ranged strength or undefined
 */
export function parseRangedCombatFromHelp(helpText: string): number | undefined {
	const match = helpText.match(/\[ICON_RANGE_STRENGTH\]\s*Ranged Strength:\s*(\d+)/);
	return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Extract movement from Help text
 *
 * @param helpText - The Help field from civilopedia data
 * @returns Movement points or undefined
 */
export function parseMovesFromHelp(helpText: string): number | undefined {
	const match = helpText.match(/\[ICON_MOVES\]\s*Moves:\s*(\d+)/);
	return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Strip color tags from civilopedia text for display
 *
 * @example
 * "[COLOR_POSITIVE_TEXT](Indian)[ENDCOLOR] Dhanurdhara" -> "(Indian) Dhanurdhara"
 */
export function stripColorTags(text: string): string {
	return text
		.replace(/\[COLOR_[A-Z_]+\]/g, '')
		.replace(/\[ENDCOLOR\]/g, '')
		.trim();
}

/**
 * Strip all formatting tags from civilopedia text
 */
export function stripAllTags(text: string): string {
	return text
		.replace(/\[[A-Z_]+\]/g, '')
		.replace(/\[NEWLINE\]/g, '\n')
		.trim();
}
