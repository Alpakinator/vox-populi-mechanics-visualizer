/**
 * Shared modifier utilities for formula calculations
 *
 * These functions replicate C++ integer math patterns used throughout
 * the Vox Populi DLL for applying percentage modifiers.
 */

import { applyModifier, applyPercent } from '$lib/types/game-context';

// Re-export the basic utilities from game-context
export { applyModifier, applyPercent };

/**
 * Apply multiple modifiers in sequence (common C++ pattern)
 *
 * @example
 * ```typescript
 * // Equivalent to:
 * // value *= (100 + mod1); value /= 100;
 * // value *= (100 + mod2); value /= 100;
 * const result = applyModifierChain(baseCost, [mod1, mod2]);
 * ```
 */
export function applyModifierChain(value: number, modifiers: number[]): number {
	let result = value;
	for (const mod of modifiers) {
		result = applyModifier(result, mod);
	}
	return result;
}

/**
 * Apply a percentage with a minimum result value
 *
 * @param value - Base value
 * @param percent - Percentage to apply (100 = 100%)
 * @param minimum - Minimum result value (default 1)
 */
export function applyPercentWithMin(value: number, percent: number, minimum: number = 1): number {
	return Math.max(minimum, applyPercent(value, percent));
}

/**
 * Round to nearest divisor (common for gold costs)
 *
 * @example
 * ```typescript
 * roundToVisibleDivisor(123, 10) // returns 120
 * roundToVisibleDivisor(127, 10) // returns 130
 * ```
 */
export function roundToVisibleDivisor(value: number, divisor: number): number {
	return Math.round(value / divisor) * divisor;
}

/**
 * Floor to divisor (strict C++ integer behavior)
 *
 * @example
 * ```typescript
 * floorToDivisor(129, 10) // returns 120
 * ```
 */
export function floorToDivisor(value: number, divisor: number): number {
	return Math.floor(value / divisor) * divisor;
}

/**
 * Clamp value to range (common min/max pattern)
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
