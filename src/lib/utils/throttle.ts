/**
 * Throttle utility for rate-limiting function calls
 * Used for smooth 60fps updates during slider manipulation
 */

/**
 * Creates a throttled version of a function that limits execution frequency.
 * Trailing calls are preserved - if called during throttle period, the last
 * call will execute after the period ends.
 *
 * @param func - Function to throttle
 * @param limit - Minimum milliseconds between executions (default 16ms = 60fps)
 * @returns Throttled function
 *
 * @example
 * ```typescript
 * const throttledUpdate = createThrottle(() => {
 *   Plotly.react(plotDiv, traces, layout);
 * }, 16);
 *
 * // In $effect:
 * $effect(() => {
 *   sliderValue; // track dependency
 *   throttledUpdate();
 * });
 * ```
 */
export function createThrottle<T extends (...args: unknown[]) => void>(
	func: T,
	limit: number = 16
): T {
	let lastRun = 0;
	let timeout: ReturnType<typeof setTimeout> | undefined;

	return ((...args: Parameters<T>) => {
		const now = Date.now();
		const remaining = limit - (now - lastRun);

		if (remaining <= 0) {
			// Enough time has passed, execute immediately
			if (timeout) {
				clearTimeout(timeout);
				timeout = undefined;
			}
			lastRun = now;
			func(...args);
		} else if (!timeout) {
			// Schedule execution for end of throttle period
			timeout = setTimeout(() => {
				lastRun = Date.now();
				timeout = undefined;
				func(...args);
			}, remaining);
		}
		// If timeout already scheduled, ignore this call (trailing call preserved)
	}) as T;
}

/**
 * Creates a debounced version of a function that delays execution until
 * after a period of inactivity.
 *
 * @param func - Function to debounce
 * @param delay - Milliseconds to wait after last call before executing
 * @returns Debounced function
 *
 * @example
 * ```typescript
 * const debouncedSave = createDebounce(() => {
 *   saveToLocalStorage(data);
 * }, 500);
 * ```
 */
export function createDebounce<T extends (...args: unknown[]) => void>(
	func: T,
	delay: number = 300
): T {
	let timeout: ReturnType<typeof setTimeout> | undefined;

	return ((...args: Parameters<T>) => {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			timeout = undefined;
			func(...args);
		}, delay);
	}) as T;
}
