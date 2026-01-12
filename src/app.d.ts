// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// Plotly.js type declarations
declare module 'plotly.js-dist' {
	export * from 'plotly.js';
	export { default } from 'plotly.js';
}

export {};
