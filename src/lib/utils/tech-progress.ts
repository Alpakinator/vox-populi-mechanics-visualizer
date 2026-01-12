/**
 * Tech Progress Utilities
 *
 * Provides utilities for mapping between tech tree position (GridX),
 * estimated tech progress (%), and production costs.
 *
 * GridX is the horizontal position in the tech tree (0 = Agriculture, 18 = Future Tech).
 * Tech progress is approximated as: (cumulative techs at GridX / total techs) * 100
 *
 * This allows us to estimate how many techs a player has typically researched
 * when they unlock items at a given tech level, which affects gold purchase costs.
 */

import type { Technology, TechReference } from '$lib/types/civilopedia';

// =============================================================================
// TYPES
// =============================================================================

export interface TechProgressData {
	/** Map from tech Type to GridX */
	techToGridX: Map<string, number>;
	/** Map from GridX to cumulative tech count (techs at or before this GridX) */
	gridXToCumulativeTechs: Map<number, number>;
	/** Total number of technologies */
	totalTechs: number;
	/** Maximum GridX value */
	maxGridX: number;
	/** Map from GridX to list of tech names at that position */
	gridXToTechNames: Map<number, string[]>;
}

export interface ProductionToTechMapping {
	/** Production cost */
	production: number;
	/** Estimated GridX for this production cost */
	estimatedGridX: number;
	/** Estimated tech progress percentage (0-100) */
	estimatedTechProgress: number;
	/** Estimated number of techs researched */
	estimatedTechsResearched: number;
}

/** Data point for production-to-GridX correlation */
export interface ProductionGridXDataPoint {
	/** Production cost of the entity */
	productionCost: number;
	/** GridX of the prerequisite tech */
	gridX: number;
	/** Name of the entity (for debugging) */
	name: string;
}

/** Correlation data for mapping production costs to GridX */
export interface ProductionGridXCorrelation {
	/** Sorted array of data points (by production cost) */
	dataPoints: ProductionGridXDataPoint[];
	/** Type of entity this correlation is for */
	entityType: 'unit' | 'building';
}

// =============================================================================
// BUILDING/UNIT COST TO GRIDX LOOKUP TABLES
// =============================================================================

/**
 * Building cost to GridX mapping (from BuildingCostSweeps.sql)
 * These are the standard costs for non-wonder buildings at each GridX level.
 */
export const BUILDING_COST_BY_GRIDX: ReadonlyMap<number, number> = new Map([
	[0, 65],
	[1, 65],
	[2, 110],
	[3, 150],
	[4, 200],
	[5, 300],
	[6, 350],
	[7, 500],
	[8, 600],
	[9, 1000],
	[10, 1250],
	[11, 1800],
	[12, 2000],
	[13, 2250],
	[14, 2250],
	[15, 2500],
	[16, 2750]
]);

/**
 * Wonder cost to GridX mapping (from BuildingCostSweeps.sql)
 */
export const WONDER_COST_BY_GRIDX: ReadonlyMap<number, number> = new Map([
	[1, 150],
	[2, 185],
	[3, 200],
	[4, 250],
	[5, 400],
	[6, 500],
	[7, 800],
	[8, 900],
	[9, 1000],
	[10, 1250],
	[11, 1600],
	[12, 1700],
	[13, 1900],
	[14, 2150],
	[15, 2300],
	[16, 3000],
	[17, 3250]
]);

// =============================================================================
// INITIALIZATION
// =============================================================================

let cachedTechProgressData: TechProgressData | null = null;

/**
 * Build tech progress data from civilopedia technologies.
 * Results are cached for subsequent calls.
 *
 * @param technologies - Array of technologies from civilopedia_export.json
 * @returns TechProgressData with all lookup maps
 */
export function buildTechProgressData(technologies: Technology[]): TechProgressData {
	if (cachedTechProgressData) {
		return cachedTechProgressData;
	}

	const techToGridX = new Map<string, number>();
	const techCountAtGridX = new Map<number, number>();
	const gridXToTechNames = new Map<number, string[]>();
	let maxGridX = 0;

	// First pass: count techs at each GridX
	for (const tech of technologies) {
		techToGridX.set(tech.Type, tech.GridX);
		techCountAtGridX.set(tech.GridX, (techCountAtGridX.get(tech.GridX) || 0) + 1);
		maxGridX = Math.max(maxGridX, tech.GridX);

		// Store tech names for reference
		if (!gridXToTechNames.has(tech.GridX)) {
			gridXToTechNames.set(tech.GridX, []);
		}
		gridXToTechNames.get(tech.GridX)!.push(tech.Name);
	}

	// Second pass: compute cumulative counts
	const gridXToCumulativeTechs = new Map<number, number>();
	let cumulative = 0;
	for (let x = 0; x <= maxGridX; x++) {
		cumulative += techCountAtGridX.get(x) || 0;
		gridXToCumulativeTechs.set(x, cumulative);
	}

	cachedTechProgressData = {
		techToGridX,
		gridXToCumulativeTechs,
		totalTechs: technologies.length,
		maxGridX,
		gridXToTechNames
	};

	return cachedTechProgressData;
}

/**
 * Clear the cached tech progress data.
 * Useful if technologies data changes (e.g., mod updates).
 */
export function clearTechProgressCache(): void {
	cachedTechProgressData = null;
}

// =============================================================================
// TECH PROGRESS CALCULATIONS
// =============================================================================

/**
 * Get GridX for a technology by its Type string.
 *
 * @param techProgressData - Pre-built tech progress data
 * @param techType - Technology Type string (e.g., "TECH_IRON_WORKING")
 * @returns GridX value or 0 if not found
 */
export function getGridXForTech(
	techProgressData: TechProgressData,
	techType: string
): number {
	return techProgressData.techToGridX.get(techType) ?? 0;
}

/**
 * Get GridX from a TechReference object.
 *
 * @param techProgressData - Pre-built tech progress data
 * @param prereqTech - TechReference with Type property
 * @returns GridX value or 0 if not found/undefined
 */
export function getGridXFromPrereqTech(
	techProgressData: TechProgressData,
	prereqTech: TechReference | undefined
): number {
	if (!prereqTech || !prereqTech.Type) {
		return 0;
	}
	return getGridXForTech(techProgressData, prereqTech.Type);
}

/**
 * Estimate the number of techs researched at a given GridX.
 *
 * This returns the cumulative count of techs at or before this GridX,
 * representing a typical player's tech count when unlocking items at this level.
 *
 * @param techProgressData - Pre-built tech progress data
 * @param gridX - GridX position in tech tree
 * @returns Estimated number of techs researched
 */
export function getEstimatedTechsAtGridX(
	techProgressData: TechProgressData,
	gridX: number
): number {
	// Clamp to valid range
	const clampedX = Math.max(0, Math.min(gridX, techProgressData.maxGridX));
	return techProgressData.gridXToCumulativeTechs.get(clampedX) ?? 0;
}

/**
 * Estimate tech progress percentage at a given GridX.
 *
 * @param techProgressData - Pre-built tech progress data
 * @param gridX - GridX position in tech tree
 * @returns Tech progress as percentage (0-100)
 */
export function getEstimatedTechProgressAtGridX(
	techProgressData: TechProgressData,
	gridX: number
): number {
	const techs = getEstimatedTechsAtGridX(techProgressData, gridX);
	return Math.floor((techs * 100) / techProgressData.totalTechs);
}

/**
 * Estimate GridX from a production cost (for buildings).
 *
 * Uses the standard building cost table to find the closest matching GridX.
 *
 * @param productionCost - Production cost of the building
 * @returns Estimated GridX value
 */
export function estimateGridXFromBuildingCost(productionCost: number): number {
	let closestGridX = 0;
	let closestDistance = Infinity;

	for (const [gridX, cost] of BUILDING_COST_BY_GRIDX) {
		const distance = Math.abs(productionCost - cost);
		if (distance < closestDistance) {
			closestDistance = distance;
			closestGridX = gridX;
		}
	}

	return closestGridX;
}

/**
 * Estimate GridX from a production cost (for wonders).
 *
 * @param productionCost - Production cost of the wonder
 * @returns Estimated GridX value
 */
export function estimateGridXFromWonderCost(productionCost: number): number {
	let closestGridX = 1;
	let closestDistance = Infinity;

	for (const [gridX, cost] of WONDER_COST_BY_GRIDX) {
		const distance = Math.abs(productionCost - cost);
		if (distance < closestDistance) {
			closestDistance = distance;
			closestGridX = gridX;
		}
	}

	return closestGridX;
}

/**
 * Get comprehensive tech progress mapping for a production cost.
 *
 * @param techProgressData - Pre-built tech progress data
 * @param productionCost - Production cost to analyze
 * @param entityType - Type of entity ('building' | 'wonder' | 'unit')
 * @returns Full mapping with GridX, tech progress %, and tech count
 */
export function getProductionToTechMapping(
	techProgressData: TechProgressData,
	productionCost: number,
	entityType: 'building' | 'wonder' | 'unit' = 'building'
): ProductionToTechMapping {
	let estimatedGridX: number;

	if (entityType === 'wonder') {
		estimatedGridX = estimateGridXFromWonderCost(productionCost);
	} else {
		// For units and buildings, use building cost table as approximation
		estimatedGridX = estimateGridXFromBuildingCost(productionCost);
	}

	const estimatedTechsResearched = getEstimatedTechsAtGridX(techProgressData, estimatedGridX);
	const estimatedTechProgress = getEstimatedTechProgressAtGridX(techProgressData, estimatedGridX);

	return {
		production: productionCost,
		estimatedGridX,
		estimatedTechProgress,
		estimatedTechsResearched
	};
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

/**
 * Format tech progress info for display.
 *
 * @param techsResearched - Number of techs researched
 * @param totalTechs - Total techs in game
 * @returns Formatted string like "45/82 techs (55%)"
 */
export function formatTechProgress(techsResearched: number, totalTechs: number): string {
	const percent = Math.floor((techsResearched * 100) / totalTechs);
	return `${techsResearched}/${totalTechs} techs (${percent}%)`;
}

/**
 * Get tick values and labels for a production cost axis that shows tech info.
 *
 * @param techProgressData - Pre-built tech progress data
 * @param maxProduction - Maximum production cost on axis
 * @returns Object with tickvals and ticktext arrays for Plotly
 */
export function getProductionAxisWithTechTicks(
	techProgressData: TechProgressData,
	maxProduction: number
): { tickvals: number[]; ticktext: string[] } {
	const tickvals: number[] = [];
	const ticktext: string[] = [];

	// Use building cost breakpoints as tick positions
	for (const [gridX, cost] of BUILDING_COST_BY_GRIDX) {
		if (cost <= maxProduction) {
			const techs = getEstimatedTechsAtGridX(techProgressData, gridX);
			tickvals.push(cost);
			ticktext.push(`${cost}\n(~${techs} techs)`);
		}
	}

	return { tickvals, ticktext };
}

/**
 * Generate annotation data for tech milestones on a graph.
 *
 * @param techProgressData - Pre-built tech progress data
 * @param maxProduction - Maximum production cost on axis
 * @returns Array of Plotly annotation objects
 */
export function getTechMilestoneAnnotations(
	techProgressData: TechProgressData,
	maxProduction: number
): Array<{
	x: number;
	y: number;
	text: string;
	showarrow: boolean;
	yanchor: string;
	font: { size: number; color: string };
}> {
	const annotations: Array<{
		x: number;
		y: number;
		text: string;
		showarrow: boolean;
		yanchor: string;
		font: { size: number; color: string };
	}> = [];

	// Key milestones: GridX 0, 5, 9, 12, 16
	const milestones = [0, 5, 9, 12, 16];

	for (const gridX of milestones) {
		const cost = BUILDING_COST_BY_GRIDX.get(gridX);
		if (cost && cost <= maxProduction) {
			const techs = getEstimatedTechsAtGridX(techProgressData, gridX);
			const percent = getEstimatedTechProgressAtGridX(techProgressData, gridX);
			annotations.push({
				x: cost,
				y: 0,
				text: `~${techs} techs (${percent}%)`,
				showarrow: false,
				yanchor: 'top',
				font: { size: 9, color: 'rgba(200, 200, 200, 0.7)' }
			});
		}
	}

	return annotations;
}

// =============================================================================
// PRODUCTION-TO-GRIDX CORRELATION
// =============================================================================

/**
 * Build a production-to-GridX correlation from a list of data points.
 * Data points should be entities (units or buildings) with known production costs
 * and prerequisite tech GridX values.
 *
 * @param dataPoints - Array of entities with production cost and GridX
 * @param entityType - Type of entity ('unit' or 'building')
 * @returns Correlation object for use with getGridXFromProductionCorrelation
 */
export function buildProductionGridXCorrelation(
	dataPoints: ProductionGridXDataPoint[],
	entityType: 'unit' | 'building'
): ProductionGridXCorrelation {
	// Sort by production cost ascending
	const sortedPoints = [...dataPoints].sort((a, b) => a.productionCost - b.productionCost);

	return {
		dataPoints: sortedPoints,
		entityType
	};
}

/**
 * Get GridX from production cost using a pre-built correlation.
 * Interpolates between known data points for accurate tech progression.
 *
 * @param correlation - Pre-built correlation from buildProductionGridXCorrelation
 * @param productionCost - Production cost to map to GridX
 * @returns Interpolated GridX value
 */
export function getGridXFromProductionCorrelation(
	correlation: ProductionGridXCorrelation,
	productionCost: number
): number {
	const { dataPoints } = correlation;

	if (dataPoints.length === 0) {
		// Fallback to building cost table if no data points
		return estimateGridXFromBuildingCost(productionCost);
	}

	// Find the two closest data points that bracket this production cost
	let lowerPoint: ProductionGridXDataPoint | null = null;
	let upperPoint: ProductionGridXDataPoint | null = null;

	for (const point of dataPoints) {
		if (point.productionCost <= productionCost) {
			if (!lowerPoint || point.productionCost > lowerPoint.productionCost) {
				lowerPoint = point;
			}
		}
		if (point.productionCost >= productionCost) {
			if (!upperPoint || point.productionCost < upperPoint.productionCost) {
				upperPoint = point;
			}
		}
	}

	// If we have both lower and upper bounds, interpolate
	if (lowerPoint && upperPoint && lowerPoint !== upperPoint) {
		const t =
			(productionCost - lowerPoint.productionCost) /
			(upperPoint.productionCost - lowerPoint.productionCost);
		return lowerPoint.gridX + t * (upperPoint.gridX - lowerPoint.gridX);
	}

	// If we have only a lower point (cost is at or above all points), use it
	if (lowerPoint) {
		return lowerPoint.gridX;
	}

	// If we have only an upper point (cost is below all points), use it
	if (upperPoint) {
		return upperPoint.gridX;
	}

	// Fallback (should never reach here if dataPoints is non-empty)
	return estimateGridXFromBuildingCost(productionCost);
}

/**
 * Get estimated tech count from production cost using correlation.
 *
 * @param techProgressData - Pre-built tech progress data
 * @param correlation - Pre-built production-GridX correlation
 * @param productionCost - Production cost
 * @returns Estimated number of techs researched
 */
export function getEstimatedTechsFromProductionCorrelation(
	techProgressData: TechProgressData,
	correlation: ProductionGridXCorrelation,
	productionCost: number
): number {
	const gridX = getGridXFromProductionCorrelation(correlation, productionCost);
	return getEstimatedTechsAtGridX(techProgressData, Math.round(gridX));
}

/**
 * Get estimated tech progress percentage from production cost using correlation.
 *
 * @param techProgressData - Pre-built tech progress data
 * @param correlation - Pre-built production-GridX correlation
 * @param productionCost - Production cost
 * @returns Tech progress as percentage (0-100)
 */
export function getEstimatedTechProgressFromProductionCorrelation(
	techProgressData: TechProgressData,
	correlation: ProductionGridXCorrelation,
	productionCost: number
): number {
	const gridX = getGridXFromProductionCorrelation(correlation, productionCost);
	return getEstimatedTechProgressAtGridX(techProgressData, Math.round(gridX));
}
