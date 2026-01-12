---
description: Generate a new Plotly graph component for visualizing Vox Populi game data
---

# Create Plotly Graph Component

Generate a Svelte 5 component that displays an interactive Plotly.js graph with slider controls for the specified data relationship.

## Required Information

Before generating, clarify:

1. **What data relationship to visualize?** (e.g., "gold cost vs production cost by era", "food threshold vs population")
2. **Which entities from civilopedia_export.json?** (units, buildings, technologies, etc.)
3. **What parameters should be adjustable via sliders?**
4. **Chart type?** (scatter, line, bar, or let me suggest based on data)

## Component Template

Generate a component following this structure:

```svelte
<script lang="ts">
  import Plotly from 'plotly.js-dist';
  import type { Data, Layout } from 'plotly.js-dist';
  import { createThrottle } from '$lib/utils/throttle';
  import type { EntityType } from '$lib/types/civilopedia';
  import civilopedia from '$lib/data/civilopedia_export.json';

  // ============================================
  // DATA LOADING
  // ============================================
  const entities: EntityType[] = civilopedia.entityKey;

  // ============================================
  // SLIDER STATE
  // ============================================
  let sliderParam = $state(defaultValue);

  // ============================================
  // PLOT REFERENCE
  // ============================================
  let plotDiv: HTMLDivElement;

  // ============================================
  // DATA COMPUTATION
  // ============================================

  /**
   * Precompute 2D matrix for single-slider sweep.
   * [entityIndex][sliderStep] = computed value
   */
  function precomputeMatrix(): number[][] {
    const steps = 100;
    const matrix: number[][] = Array(entities.length)
      .fill(null)
      .map(() => Array(steps).fill(0));

    for (let i = 0; i < entities.length; i++) {
      for (let j = 0; j < steps; j++) {
        const paramValue = minValue + j * stepSize;
        matrix[i][j] = calculateValue(entities[i], paramValue);
      }
    }
    return matrix;
  }

  const dataMatrix = precomputeMatrix();

  /**
   * Build Plotly traces from current slider position
   */
  function buildTraces(sliderValue: number): Data[] {
    // Extract column from matrix or compute on-demand
    return [{
      type: 'scatter',
      mode: 'markers',
      name: 'Entity Name',
      x: entities.map(e => e.xProperty),
      y: dataMatrix.map(row => row[sliderIndex]),
      text: entities.map(e => e.Name),
      hovertemplate: '%{text}<br>X: %{x}<br>Y: %{y}<extra></extra>',
      marker: {
        size: 8,
        color: entities.map(e => e.EraID),
        colorscale: 'Viridis',
        showscale: true,
        colorbar: { title: 'Era' }
      }
    }];
  }

  /**
   * Build Plotly layout configuration
   */
  function buildLayout(): Partial<Layout> {
    return {
      title: { text: 'Graph Title', font: { family: 'Tw Cen MT', size: 18 } },
      font: { family: 'Tw Cen MT' },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'rgba(30, 30, 30, 0.8)',
      margin: { l: 70, r: 30, t: 60, b: 60 },
      xaxis: {
        title: 'X Axis Label',
        gridcolor: '#444',
        zerolinecolor: '#666'
      },
      yaxis: {
        title: 'Y Axis Label',
        gridcolor: '#444',
        zerolinecolor: '#666'
      },
      hovermode: 'closest',
      dragmode: 'pan'
    };
  }

  // ============================================
  // REACTIVE UPDATES
  // ============================================

  const throttledUpdate = createThrottle(() => {
    if (!plotDiv) return;
    Plotly.react(plotDiv, buildTraces(sliderParam), buildLayout());
  }, 16);

  // Track initialization state
  let initialized = false;

  // Initial render (runs once when plotDiv is bound)
  $effect(() => {
    if (plotDiv && !initialized) {
      initialized = true;
      Plotly.newPlot(plotDiv, buildTraces(sliderParam), buildLayout(), {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        displaylogo: false
      });
    }
  });

  // Update on slider change (runs after initialization)
  $effect(() => {
    if (!initialized) return;
    sliderParam; // Track dependency
    throttledUpdate();
  });
</script>

<!-- ============================================ -->
<!-- TEMPLATE -->
<!-- ============================================ -->

<div class="graph-container">
  <div class="controls">
    <label class="slider-label">
      <span>Parameter Name: {sliderParam}</span>
      <input
        type="range"
        bind:value={sliderParam}
        min={minValue}
        max={maxValue}
        step={stepValue}
      />
    </label>
  </div>

  <div bind:this={plotDiv} class="plot"></div>
</div>

<!-- ============================================ -->
<!-- STYLES -->
<!-- ============================================ -->

<style>
  .graph-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: rgba(20, 20, 20, 0.9);
    border-radius: 8px;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .slider-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-family: 'Tw Cen MT', sans-serif;
    color: #ddd;
  }

  .slider-label input[type="range"] {
    width: 200px;
    cursor: pointer;
  }

  .plot {
    width: 100%;
    height: 500px;
  }
</style>
```

## Checklist Before Generating

- [ ] Identified data source in civilopedia_export.json
- [ ] Defined TypeScript types for entities if not existing
- [ ] Determined calculation formula (from C++ translation or simple property access)
- [ ] Set appropriate slider min/max/default values
- [ ] Chose appropriate chart type for data relationship
- [ ] Named component descriptively (e.g., `UnitCostByEraGraph.svelte`)

## Output Location

Place generated components in `src/lib/components/graphs/[ComponentName].svelte`
