---
description: 'Plotly.js integration standards for Svelte 5 graph components'
applyTo: '**/*.svelte, **/graphs/*.ts'
---

# Plotly.js Reactive Integration Standards

Code standards for Plotly graph components in Svelte 5.

## Core Principles

- **60fps updates**: Slider-driven updates must feel instantaneous
- **Efficient rendering**: Use `Plotly.react()` for updates, `Plotly.newPlot()` only for initial render
- **Precomputation**: Single slider = precompute full sweep; multiple sliders = on-demand only

## Required Patterns


Every page with Plotly requires a `+page.ts`:

```typescript
export const ssr = false;
export const prerender = true;
```

### Dynamic Import

Load Plotly client-side only:

```typescript
onMount(async () => {
  const module = await import('plotly.js-dist');
  Plotly = module.default;
});
```

### Throttled Updates

Always throttle slider-driven updates:

```typescript
import { createThrottle } from '$lib/utils/throttle';

const throttledUpdate = createThrottle(() => {
  if (!plotDiv || !initialized || !Plotly) return;
  Plotly.react(plotDiv, traces, layout);
}, 16); // 60fps
```

### Initialization Pattern

```typescript
let initialized = $state(false);

$effect(() => {
  if (plotDiv && !initialized && Plotly) {
    initialized = true;
    Plotly.newPlot(plotDiv, traces, layout, { responsive: true });
  }
});
```

## Style Standards

### Layout Configuration

```typescript
const layout = {
  font: { family: 'Tw Cen MT' },
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  margin: { l: 60, r: 30, t: 50, b: 50 },
  xaxis: { gridcolor: '#444' },
  yaxis: { gridcolor: '#444' },
  hovermode: 'closest'
};
```

### Page Layout

```css
.page-container { display: flex; height: 100vh; }
.control-panel { width: 320px; padding: 1.5rem; overflow-y: auto; }
.graph-panel { flex: 1; }
.plot-container { width: 100%; height: 100%; }
```

## Performance Checklist

- [ ] `Plotly.react()` for all updates after initial render
- [ ] Throttle to 16ms
- [ ] Use `$derived()` for expensive computations
- [ ] Pre-allocate arrays with known sizes
- [ ] No frame drops during slider drag

## For Full Implementation Examples

See the `plotly-graph` skill for complete component templates and step-by-step workflows.
