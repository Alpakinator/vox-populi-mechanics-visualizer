---
description: 'Visual design conventions for controls and Plotly graphs in the VP Mechanics Visualizer'
applyTo: '**/*.svelte, **/*.css, **/*.scss'
---

# Visual Design Language

Use [src/routes/+page.svelte](src/routes/+page.svelte) as the canonical visual reference for new UI work.

## Core Principle

New pages, modes, and graph panels should look like part of the existing tool, not like a separate mini-site. Reuse the main page's visual grammar instead of inventing a separate palette, card language, or rounding system.

## Left Panel Conventions

- Left-panel grouped controls should use dark boxed sections with gold borders.
- Prefer `background-color: #070b0eff` and `border: 1px solid rgba(207, 175, 115, 1)` for section containers.
- Use sharp corners. `border-radius` should generally be `0` or `4px`; do not introduce soft 12px/20px/24px card rounding.
- Buttons, inputs, selects, tables, chips, and badges should follow the same sharp-edged treatment.

## Inputs And Buttons

- Standard input/select styling should match the main page:
  - `background-color: rgba(100, 100, 150, 0.3)`
  - `border: 1px solid #ffc864`
  - `border-radius: 4px`
  - hover brightens toward gold
  - focus uses blue border and blue glow
- Buttons should not be pill-shaped.
- Use the same gold-outline / dark-fill button treatment already present on the main page.

## Plotly Graph Conventions

- Plot backgrounds should match the main page:
  - `paper_bgcolor: #070b0eff`
  - `plot_bgcolor: #070b0eff`
- Default graph title styling should match the main page Plotly charts:
  - font family `Tw Cen MT, sans-serif`
  - title size `19`
- Default axis styling should match the main page:
  - axis title size `16`
  - tick font size `14`
  - `gridcolor: rgba(100, 100, 100, 0.3)`
  - `zerolinecolor: rgba(207, 175, 115, 0.8)`
- Prefer full-height graph surfaces over decorative framed cards unless the existing page being extended already uses card wrappers.

## Information Placement

- If a piece of information is directly tied to one chart, prefer a Plotly annotation inside that chart over a separate summary ribbon.
- Avoid adding extra dashboard-like summary boxes above charts unless the page already uses that pattern.

## What To Avoid

- Do not introduce rounded "app card" wrappers that conflict with the main page.
- Do not create a separate color system for a new mode when the existing one already provides a clear reference.
- Do not treat a new graph mode like a standalone microsite if it belongs inside the main selector-driven workspace.