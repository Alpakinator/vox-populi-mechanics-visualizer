---
name: plotly-graph
description: Edit or create interactive Plotly.js graph components in Svelte 5. Use when asked to create a graph, add a visualization, build a chart, make a plot, visualize data, add slider controls to a graph, or create a new graph page. Handles 60fps slider updates, throttling, data precomputation, and proper Svelte 5 reactivity patterns.
---

# Plotly Graph Component Builder

Creates performant, reactive Plotly.js graph components in Svelte 5 with slider controls.

## When to Use This Skill

- Creating a new graph or visualization page
- Adding a Plotly chart to an existing page
- Implementing slider-controlled interactive graphs
- Building data visualizations with live updates
- Creating comparison charts for game mechanics

## Prerequisites

- Plotly.js is already installed (`plotly.js-dist`)
- Throttle utility exists at `$lib/utils/throttle.ts`
- SSR must be disabled for pages with Plotly

## Step-by-Step: Create a New Graph Page

### 1. Create the Page Route

Create `src/routes/[your-page]/+page.svelte` and `src/routes/[your-page]/+page.ts`:

**+page.ts** (disables SSR):
```typescript
export const ssr = false;
export const prerender = true;
```

### 2. Use the Graph Component Template

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createThrottle } from '$lib/utils/throttle';

  // Plotly loaded dynamically (no SSR)
  let Plotly: typeof import('plotly.js-dist').default | null = $state(null);
  let plotDiv: HTMLDivElement | undefined = $state();
  let initialized = $state(false);

  // Your data and slider state
  let sliderValue = $state(50);
  let data: YourDataType[] = $state([]);

  // Load Plotly on mount
  onMount(async () => {
    const module = await import('plotly.js-dist');
    Plotly = module.default;
  });

  // Compute graph data (use $derived for automatic caching)
  const graphData = $derived(computeGraphData(data, sliderValue));

  // Build Plotly traces and layout
  function buildPlot() {
    const traces = [{
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Series Name',
      x: graphData.map(d => d.x),
      y: graphData.map(d => d.y),
      marker: { size: 6 },
      hovertemplate: '%{x}: %{y}<extra>%{fullData.name}</extra>'
    }];

    const layout = {
      title: { text: 'Graph Title', font: { family: 'Tw Cen MT' } },
      font: { family: 'Tw Cen MT' , color:'fafac4ff'},
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      margin: { l: 60, r: 30, t: 50, b: 50 },
      xaxis: { title: 'X Label', gridcolor: '#444' },
      yaxis: { title: 'Y Label', gridcolor: '#444' },
      hovermode: 'closest'
    };

    return { traces, layout };
  }

  // Throttled update (60fps)
  const throttledUpdate = createThrottle(() => {
    if (!plotDiv || !initialized || !Plotly) return;
    const { traces, layout } = buildPlot();
    Plotly.react(plotDiv, traces, layout);
  }, 16);

  // Initial render
  $effect(() => {
    if (plotDiv && !initialized && Plotly) {
      initialized = true;
      const { traces, layout } = buildPlot();
      Plotly.newPlot(plotDiv, traces, layout, { responsive: true });
    }
  });

  // Update on slider change
  $effect(() => {
    if (!initialized) return;
    sliderValue; // Track dependency
    throttledUpdate();
  });
</script>

<div class="page-container">
  <div class="control-panel">
    <h2>Controls</h2>
    <label>
      Parameter: {sliderValue}
      <input type="range" bind:value={sliderValue} min={0} max={100} step={1} />
    </label>
  </div>
  
  <div class="graph-panel">
    <div class="plot-container" bind:this={plotDiv}></div>
  </div>
</div>

<style>
  .page-container { display: flex; height: 100vh; }
  .control-panel { width: 320px; padding: 1.5rem; overflow-y: auto; }
  .graph-panel { flex: 1; }
  .plot-container { width: 100%; height: 100%; }
</style>
```

### 3. Implement Data Precomputation (Single Slider)

When only one slider drives the graph, precompute the full sweep:

```typescript
function precomputeMatrix(
  baseData: EntityData[],
  paramRange: { min: number; max: number; steps: number }
): number[][] {
  const { min, max, steps } = paramRange;
  const stepSize = (max - min) / steps;

  const matrix: number[][] = Array(baseData.length)
    .fill(null)
    .map(() => Array(steps).fill(0));

  for (let i = 0; i < baseData.length; i++) {
    for (let j = 0; j < steps; j++) {
      const paramValue = min + j * stepSize;
      matrix[i][j] = calculateValue(baseData[i], paramValue);
    }
  }

  return matrix;
}
```

### 4. Multi-Slider (On-Demand) Pattern

For 2+ sliders, compute only current values (no precomputation):

```typescript
function computeCurrentValues(
  baseData: EntityData[],
  slider1: number,
  slider2: number
): number[] {
  return baseData.map((entity) => calculateValue(entity, slider1, slider2));
}
```

## Configuration Reference

### Layout Options
```typescript
const layout: Partial<Layout> = {
  title: { text: 'Title', font: { family: 'Tw Cen MT' } },
  font: { family: 'Tw Cen MT' },
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  margin: { l: 60, r: 30, t: 50, b: 50 },
  xaxis: { title: 'X', gridcolor: '#444' },
  yaxis: { title: 'Y', gridcolor: '#444' },
  hovermode: 'closest',
  dragmode: 'pan'
};
```

### Trace Options
```typescript
const trace: Partial<Data> = {
  type: 'scatter',
  mode: 'lines+markers',
  name: 'Series',
  x: xValues,
  y: yValues,
  marker: { size: 6 },
  hovertemplate: '%{x}: %{y}<extra>%{fullData.name}</extra>'
};
```

### Config Options
```typescript
const config = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  displaylogo: false
};
```

## Performance Checklist

- [ ] Use `Plotly.react()` for all updates after initial render
- [ ] Throttle slider updates to 16ms (60fps)
- [ ] Pre-allocate arrays with known sizes
- [ ] Avoid creating objects/arrays in hot paths
- [ ] Use `$derived()` for expensive computations
- [ ] Profile with DevTools - no frame drops during slider drag

## Error Handling

```typescript
$effect(() => {
  if (!plotDiv) return;
  try {
    Plotly.react(plotDiv, traces, layout);
  } catch (error) {
    console.error('Plotly render error:', error);
    Plotly.newPlot(plotDiv, traces, layout, { responsive: true });
  }
});
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Graph doesn't render | Check SSR is disabled (`export const ssr = false` in +page.ts) |
| Slider feels laggy | Verify throttle is 16ms, check for heavy computations |
| Plot not responsive | Add `{ responsive: true }` to config |
| Updates not showing | Use `Plotly.react()` not `Plotly.newPlot()` for updates |

## References

See the actual source files:
- Throttle utility: `src/lib/utils/throttle.ts`
- Gold purchase graph example: `src/routes/+page.svelte`
