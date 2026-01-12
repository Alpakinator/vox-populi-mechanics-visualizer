/**
 * Type declarations for plotly.js-dist
 * The plotly.js-dist package is the pre-bundled version of plotly.js
 * It doesn't include its own types, but the @types/plotly.js package
 * provides types for the main plotly.js library
 */

declare module 'plotly.js-dist' {
	import * as Plotly from 'plotly.js';
	export = Plotly;
	export as namespace Plotly;
}
