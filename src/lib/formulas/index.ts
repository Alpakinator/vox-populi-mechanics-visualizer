/**
 * Formula modules for Vox Populi game mechanics
 *
 * Each formula is translated from C++ source with preserved integer math semantics.
 * See individual modules for @source references to original C++ code.
 */

// Modifier utilities
export * from './modifiers';

// Gold purchase formulas (production -> gold conversion)
export * from './gold-purchase';

// Tech progress utilities (GridX to tech count mapping)
export { buildTechProgressData, getEstimatedTechsAtGridX, getEstimatedTechProgressAtGridX, getProductionToTechMapping, BUILDING_COST_BY_GRIDX, type TechProgressData } from '$lib/utils/tech-progress';

// Formula modules will be added here as they are translated:
// export * from './growth';      // Population growth thresholds
// export * from './production';  // Unit/building production costs
// export * from './combat';      // Combat strength calculations
// export * from './yields';      // Tile and building yield formulas
