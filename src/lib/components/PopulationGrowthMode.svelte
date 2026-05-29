<script lang="ts">
	import { onMount } from 'svelte';
	import { createThrottle } from '$lib/utils/throttle';
	import {
		createDefaultGameContext,
		ERA_DEFAULTS,
		GAME_SPEED_DEFAULTS,
		type EraType,
		type GameContext,
		type GameSpeedType
	} from '$lib/types/game-context';
	import {
		getBirthYieldEraMultiplier,
		getEffectiveFoodForCitizenBirth,
		getEraTypeForCitizenBirth,
		getGrowthThreshold
	} from '$lib/formulas/growth';
	import {
		POPULATION_GROWTH_BUILDING_SOURCES,
		POPULATION_GROWTH_GLOBAL_SOURCES,
		POPULATION_GROWTH_OUTPUT_YIELDS
	} from '$lib/utils/population-growth-sources';
	import { FOOD_MODIFIER_SOURCES, GROWTH_MODIFIER_SOURCES } from '$lib/utils/growth-modifier-sources';
	import type {
		BirthYieldBreakdown,
		BirthYieldFormula,
		EraThreshold,
		GrowthYieldType,
		PopulationGrowthGlobalSource
	} from '$lib/types/population-growth';

	type PlotlyModule = typeof import('plotly.js-dist').default;
	type GraphMode = 'gold-vs-production' | 'ratio-vs-gridx' | 'combat-efficiency' | 'population-growth';

	interface CitizenGrowthPoint {
		targetCitizen: number;
		threshold: number;
		carriedFood: number;
		effectiveFood: number;
		eraType: EraType;
		eraMultiplier: number;
		yields: Record<GrowthYieldType, BirthYieldBreakdown>;
		/** effectiveFood / (1 + totalGrowthPct/100). Net surplus per turn you need before growth mods amplify it. */
		growthAdjustedSurplus: number;
		/** effectiveFood / ((1 + totalFoodPct/100) × (1 + totalGrowthPct/100)). Threshold expressed in raw base food units. */
		baseFoodEquiv: number;
		/** Total food % modifier at this citizen count (varies due to Harappan follower scaling). */
		totalFoodPct: number;
	}

	let {
		graphMode = $bindable('population-growth'),
		showGraphModeSwitcher = false
	}: {
		graphMode?: GraphMode;
		showGraphModeSwitcher?: boolean;
	} = $props();

	const BASE_CONTEXT = createDefaultGameContext();
	const GRAPH_YIELDS: Array<{ type: GrowthYieldType; label: string; color: string }> = [
		{ type: 'YIELD_FOOD', label: 'Food', color: '#7ecb4d' },
		{ type: 'YIELD_PRODUCTION', label: 'Production', color: '#d08a28' },
		{ type: 'YIELD_GOLD', label: 'Gold', color: '#e2c14d' },
		{ type: 'YIELD_SCIENCE', label: 'Science', color: '#5fb0ff' },
		{ type: 'YIELD_CULTURE', label: 'Culture', color: '#cf7be8' },
		{ type: 'YIELD_FAITH', label: 'Faith', color: '#f0f0d7' },
		{ type: 'YIELD_GOLDEN_AGE_POINTS', label: 'Golden Age Points', color: '#ff7d58' },
		{ type: 'YIELD_GREAT_PEOPLE_POINTS', label: 'Great Person Points', color: '#b0e0a0' }
	];
	const ERA_OPTIONS = Object.values(ERA_DEFAULTS);

	function buildDefaultEraThresholds(): EraThreshold[] {
		return [
			{ citizen: 1, eraType: 'ERA_ANCIENT' },
			{ citizen: 6, eraType: 'ERA_CLASSICAL' },
			{ citizen: 8, eraType: 'ERA_MEDIEVAL' },
			{ citizen: 10, eraType: 'ERA_RENAISSANCE' },
			{ citizen: 12, eraType: 'ERA_INDUSTRIAL' },
			{ citizen: 14, eraType: 'ERA_MODERN' },
			{ citizen: 16, eraType: 'ERA_ATOMIC' },
			{ citizen: 40, eraType: 'ERA_INFORMATION' }
		];
	}

	function buildInitialEraThresholds(): EraThreshold[] {
		return [
			{ citizen: 10, eraType: 'ERA_ATOMIC' },
			{ citizen: 50, eraType: 'ERA_INFORMATION' }
		];
	}

	function sanitizeEraThresholds(thresholds: EraThreshold[]): EraThreshold[] {
		return thresholds.map((threshold) => ({
			citizen: Math.max(2, Math.floor(threshold.citizen)),
			eraType: threshold.eraType
		}));
	}

	function sortEraThresholdsByCitizen(thresholds: EraThreshold[]): EraThreshold[] {
		return [...thresholds]
			.map((threshold) => ({
				citizen: Math.max(2, Math.floor(threshold.citizen)),
				eraType: threshold.eraType
			}))
			.sort((left, right) => left.citizen - right.citizen || left.eraType.localeCompare(right.eraType));
	}

	function sortEraThresholdsByEra(thresholds: EraThreshold[]): EraThreshold[] {
		return [...sanitizeEraThresholds(thresholds)].sort(
			(left, right) =>
				ERA_DEFAULTS[left.eraType].id - ERA_DEFAULTS[right.eraType].id || left.citizen - right.citizen
		);
	}

	function formatBirthYield(formula: BirthYieldFormula): string {
		const yieldLabel = GRAPH_YIELDS.find((entry) => entry.type === formula.yieldType)?.label ?? formula.yieldType;
		if (formula.kind === 'city-output-percent') {
			return `${formula.percent}% ${yieldLabel} output`;
		}

		return `${formula.amount} ${yieldLabel}${formula.eraScaled ? ' x Era' : ''}`;
	}

	function createEmptyYieldBreakdowns(): Record<GrowthYieldType, BirthYieldBreakdown> {
		return Object.fromEntries(
			GRAPH_YIELDS.map((entry) => [
				entry.type,
				{
					yieldType: entry.type,
					amount: 0,
					contributions: []
				}
			])
		) as unknown as Record<GrowthYieldType, BirthYieldBreakdown>;
	}

	function addYieldContribution(
		breakdowns: Record<GrowthYieldType, BirthYieldBreakdown>,
		yieldType: GrowthYieldType,
		sourceType: string,
		sourceName: string,
		amount: number
	) {
		if (amount <= 0) {
			return;
		}

		breakdowns[yieldType].amount += amount;
		breakdowns[yieldType].contributions.push({
			sourceType,
			sourceName,
			amount
		});
	}

	let Plotly: PlotlyModule | null = $state(null);
	let growthPlotDiv: HTMLDivElement | undefined = $state();
	let ratioPlotDiv: HTMLDivElement | undefined = $state();
	let initialized = $state(false);
	let lockedYRangeGrowth: [number, number] | null = null;
	let lockedYRangeRatio: [number, number] | null = null;
	let activeGraph = $state<'growth' | 'ratio'>('ratio');

	let panelWidth: number | null = $state(null);
	let isDragging = $state(false);
	let pageContainer: HTMLDivElement | undefined = $state();

	let gameSpeedType = $state<GameSpeedType>('GAMESPEED_STANDARD');
	let maxCitizen = $state(70);
	let minCitizen = $state(10);
	let cityIsCapital = $state(false);
	let enabledBuildingTypes = $state(new Set<string>());

	// Growth modifier state — all stack additively, applied to net surplus (post-consumption).
	// Source: CvCity.cpp:15992 getGrowthMods()
	let isWLTKD = $state(true);
	let rationalistOpener = $state(false);
	let rationalistExtra = $state(0); // 0–5 non-opener Rationalism policies, +5% each
	let peaceAndBread = $state(false);
	let goddessBelief = $state(false);
	let dagdaBelief = $state(false);
	let isGoldenAge = $state(false);
	let niloGoldenAge = $state(false);
	let emancipationGoldenAge = $state(false);
	let localHappinessDelta = $state(20); // net local happiness − local unhappiness; +2% growth per point
	let tradeRouteGrowthPct = $state(0); // growth % from outgoing trade routes to cities you're influential over

	// Food yield modifier state — applied to gross food BEFORE consumption.
	// Source: CvCity.cpp:22931 getYieldRateTimes100() iModifier section
	let foodTempleArtemis = $state(true);
	let foodIFC = $state(false);
	let foodThroneRoom = $state(false);
	let foodGurdwara = $state(false);
	let foodHarappan = $state(false);
	let harappanFollowerPct = $state(90);
	let enabledGlobalSourceTypes = $state(new Set<string>());
	let eraThresholds = $state<EraThreshold[]>(buildInitialEraThresholds());
	let cityOutputByYield = $state<Record<GrowthYieldType, number>>({
		YIELD_FOOD: 0,
		YIELD_PRODUCTION: 300,
		YIELD_GOLD: 0,
		YIELD_SCIENCE: 100,
		YIELD_CULTURE: 0,
		YIELD_FAITH: 0,
		YIELD_GOLDEN_AGE_POINTS: 0,
		YIELD_GREAT_PEOPLE_POINTS: 0
	});

	const gameContext = $derived<GameContext>({
		...BASE_CONTEXT,
		gameSpeed: GAME_SPEED_DEFAULTS[gameSpeedType]
	});

	/**
	 * Total additive growth % modifier. Applied to net food surplus (after consumption).
	 * Stacks additively per getGrowthMods().
	 */
	const totalGrowthPct = $derived(
		(isWLTKD ? 25 : 0) +
			(rationalistOpener ? 10 : 0) +
			Math.max(0, Math.min(5, rationalistExtra)) * 5 +
			(peaceAndBread ? 20 : 0) +
			(goddessBelief ? 25 : 0) +
			(dagdaBelief ? 25 : 0) +
			(isGoldenAge && niloGoldenAge ? 10 : 0) +
			(isGoldenAge && emancipationGoldenAge ? 10 : 0) +
			Math.max(0, localHappinessDelta) * 2 +
			Math.max(0, tradeRouteGrowthPct)
	);

	/**
	 * Total additive food yield % modifier at a given citizen count.
	 * Harappan scales with floor(population × followerPct / 100).
	 */
	function computeTotalFoodPct(citizen: number): number {
		const population = citizen - 1;
		let total = 0;
		if (foodTempleArtemis) total += 10;
		if (foodIFC) total += 5;
		if (foodThroneRoom && cityIsCapital) total += 10;
		if (foodGurdwara) total += 10;
		if (foodHarappan) {
			const followers = Math.floor((population * Math.max(0, Math.min(100, harappanFollowerPct))) / 100);
			total += followers; // +1% per follower
		}
		return total;
	}

	const buildingTypesByClass = new Map<string, string[]>();
	for (const source of POPULATION_GROWTH_BUILDING_SOURCES) {
		if (!buildingTypesByClass.has(source.buildingClass)) {
			buildingTypesByClass.set(source.buildingClass, []);
		}
		buildingTypesByClass.get(source.buildingClass)!.push(source.type);
	}

	function buildDefaultBuildingToggleSet(): Set<string> {
		const enabled = new Set<string>();
		for (const source of POPULATION_GROWTH_BUILDING_SOURCES) {
			if (source.defaultEnabled) {
				enabled.add(source.type);
			}
		}
		return enabled;
	}

	function buildDefaultGlobalSourceToggleSet(): Set<string> {
		const enabled = new Set<string>();
		for (const source of POPULATION_GROWTH_GLOBAL_SOURCES) {
			if (source.defaultEnabled) {
				enabled.add(source.type);
			}
		}
		return enabled;
	}

	let buildingTogglesInitialized = false;
	$effect(() => {
		if (!buildingTogglesInitialized && POPULATION_GROWTH_BUILDING_SOURCES.length > 0) {
			buildingTogglesInitialized = true;
			enabledBuildingTypes = buildDefaultBuildingToggleSet();
			enabledGlobalSourceTypes = buildDefaultGlobalSourceToggleSet();
		}
	});

	function toggleBuilding(type: string, enabled: boolean) {
		const source = POPULATION_GROWTH_BUILDING_SOURCES.find((entry) => entry.type === type);
		if (!source) {
			return;
		}

		const next = new Set(enabledBuildingTypes);
		if (enabled) {
			const siblings = buildingTypesByClass.get(source.buildingClass) ?? [];
			for (const sibling of siblings) {
				next.delete(sibling);
			}
			next.add(type);
		} else {
			next.delete(type);
		}

		enabledBuildingTypes = next;
	}

	function toggleGlobalSource(type: string, enabled: boolean) {
		const next = new Set(enabledGlobalSourceTypes);
		if (enabled) {
			next.add(type);
		} else {
			next.delete(type);
		}
		enabledGlobalSourceTypes = next;
	}

	function resetBuildings() {
		enabledBuildingTypes = buildDefaultBuildingToggleSet();
	}

	function resetGlobalSources() {
		enabledGlobalSourceTypes = buildDefaultGlobalSourceToggleSet();
	}

	function updateCityOutput(yieldType: GrowthYieldType, value: number) {
		cityOutputByYield = {
			...cityOutputByYield,
			[yieldType]: Math.max(0, Math.floor(value))
		};
	}

	function updateEraThresholdCitizen(index: number, citizen: number) {
		if (!Number.isFinite(citizen)) {
			return;
		}

		const next = [...eraThresholds];
		next[index] = { ...next[index], citizen: Math.floor(citizen) };
		eraThresholds = next;
	}

	function commitEraThresholdCitizen(index: number, citizen: number) {
		if (!Number.isFinite(citizen)) {
			return;
		}

		const next = [...eraThresholds];
		next[index] = { ...next[index], citizen: Math.max(2, Math.floor(citizen)) };
		eraThresholds = next;
	}

	function updateEraThresholdEra(index: number, eraType: EraType) {
		const next = [...eraThresholds];
		next[index] = { ...next[index], eraType };
		eraThresholds = sortEraThresholdsByEra(next);
	}

	function addEraThreshold() {
		const ordered = sortEraThresholdsByEra(eraThresholds);
		const last = ordered[ordered.length - 1];
		eraThresholds = sortEraThresholdsByEra([
			...ordered,
			{ citizen: last.citizen + 6, eraType: last.eraType }
		]);
	}

	function removeEraThreshold(index: number) {
		if (eraThresholds.length <= 1) {
			return;
		}

		eraThresholds = sortEraThresholdsByEra(
			eraThresholds.filter((_threshold, thresholdIndex) => thresholdIndex !== index)
		);
	}

	function resetEraThresholds() {
		eraThresholds = buildDefaultEraThresholds();
	}

	function sourceScopeApplies(source: PopulationGrowthGlobalSource): boolean {
		if (source.scope === 'capital') {
			return cityIsCapital;
		}

		return true;
	}

	const activeBuildingSources = $derived(
		POPULATION_GROWTH_BUILDING_SOURCES.filter((source) => enabledBuildingTypes.has(source.type))
	);

	const activeGlobalSources = $derived(
		POPULATION_GROWTH_GLOBAL_SOURCES.filter(
			(source) => enabledGlobalSourceTypes.has(source.type) && sourceScopeApplies(source)
		)
	);

	const totalCarryoverPercent = $derived(
		activeBuildingSources.reduce((total, source) => total + source.carryoverPercent, 0)
	);

	const activeOutputYieldTypes = $derived(
		POPULATION_GROWTH_OUTPUT_YIELDS.filter((yieldType) =>
			activeBuildingSources.some((source) =>
				source.birthYields.some((formula) => formula.kind === 'city-output-percent' && formula.yieldType === yieldType)
			)
		)
	);

	function computeBirthYields(targetCitizen: number): Record<GrowthYieldType, BirthYieldBreakdown> {
		const breakdowns = createEmptyYieldBreakdowns();
		const eraType = getEraTypeForCitizenBirth(targetCitizen, sortEraThresholdsByCitizen(eraThresholds), 'ERA_ANCIENT');
		const eraMultiplier = getBirthYieldEraMultiplier(ERA_DEFAULTS[eraType].id);

		for (const source of activeBuildingSources) {
			for (const formula of source.birthYields) {
				const amount =
					formula.kind === 'flat'
						? formula.amount * (formula.eraScaled ? eraMultiplier : 1)
						: Math.floor((cityOutputByYield[formula.yieldType] * formula.percent) / 100);

				addYieldContribution(breakdowns, formula.yieldType, source.type, source.name, amount);
			}
		}

		for (const source of activeGlobalSources) {
			for (const formula of source.birthYields) {
				const amount = formula.amount * (formula.eraScaled ? eraMultiplier : 1);
				addYieldContribution(breakdowns, formula.yieldType, source.type, source.name, amount);
			}
		}

		return breakdowns;
	}

	const graphPoints = $derived.by(() => {
		const points: CitizenGrowthPoint[] = [];
		const sortedThresholds = sortEraThresholdsByCitizen(eraThresholds);

		for (let targetCitizen = Math.max(2, minCitizen + 1); targetCitizen <= maxCitizen; targetCitizen += 1) {
			const threshold = getGrowthThreshold(targetCitizen - 1, gameContext);
			const previousThreshold = targetCitizen > 2 ? getGrowthThreshold(targetCitizen - 2, gameContext) : 0;
			const carriedFood = targetCitizen > 2 ? Math.floor((previousThreshold * totalCarryoverPercent) / 100) : 0;
			const eraType = getEraTypeForCitizenBirth(targetCitizen, sortedThresholds, 'ERA_ANCIENT');
			const effectiveFood = getEffectiveFoodForCitizenBirth(targetCitizen, totalCarryoverPercent, gameContext);

			// Growth-adjusted: divide effectiveFood by (1 + g%) to get the pre-modifier surplus target.
			const growthAdjustedSurplus =
				totalGrowthPct > 0 ? Math.round((effectiveFood * 100) / (100 + totalGrowthPct)) : effectiveFood;

			// Base food equivalent: effectiveFood threshold expressed in raw base food units.
			// = effectiveFood / ((1 + food%) × (1 + growth%))
			const totalFoodPct = computeTotalFoodPct(targetCitizen);
			const combinedMultiplier = ((100 + totalFoodPct) / 100) * ((100 + totalGrowthPct) / 100);
			const baseFoodEquiv = Math.round(effectiveFood / combinedMultiplier);

			points.push({
				targetCitizen,
				threshold,
				carriedFood,
				effectiveFood,
				eraType,
				eraMultiplier: getBirthYieldEraMultiplier(ERA_DEFAULTS[eraType].id),
				yields: computeBirthYields(targetCitizen),
				growthAdjustedSurplus,
				baseFoodEquiv,
				totalFoodPct
			});
		}

		return points;
	});

	function buildGrowthPlot() {
		const showGrowthAdj = totalGrowthPct > 0;
		const showBaseFood = totalGrowthPct > 0 || foodTempleArtemis || foodIFC || (foodThroneRoom && cityIsCapital) || foodGurdwara || foodHarappan;

		const traces: Array<Record<string, unknown>> = [
			{
				type: 'scatter',
				mode: 'lines',
				name: 'Food to Accumulate',
				x: graphPoints.map((point) => point.targetCitizen - 1),
				y: graphPoints.map((point) => point.effectiveFood),
				line: { color: '#ffc864', width: 2.5, shape: 'spline', smoothing: 0.5 },
				customdata: graphPoints.map((point) => [
					point.threshold,
					point.carriedFood,
					ERA_DEFAULTS[point.eraType].name,
					point.eraMultiplier,
					point.targetCitizen
				]),
				hovertemplate:
					'Food to accumulate: %{y}<br>' +
					'Raw threshold: %{customdata[0]}<br>' +
					'Carried from previous birth: %{customdata[1]}<br>' +
					'Era step: %{customdata[2]} (x%{customdata[3]})<extra></extra>'
			}
		];

		if (showGrowthAdj) {
			traces.push({
				type: 'scatter',
				mode: 'lines',
				name: 'Net Surplus Needed (growth-adj)',
				x: graphPoints.map((point) => point.targetCitizen - 1),
				y: graphPoints.map((point) => point.growthAdjustedSurplus),
				line: { color: '#7ecb4d', width: 2, dash: 'dash' },
				customdata: graphPoints.map((point) => [point.effectiveFood, totalGrowthPct]),
				hovertemplate:
					'Surplus needed (pre-growth-mod): %{y}<br>' +
					'Raw food to accumulate: %{customdata[0]}<br>' +
					'Growth modifier: +%{customdata[1]}%<extra></extra>'
			});
		}

		if (showBaseFood) {
			traces.push({
				type: 'scatter',
				mode: 'lines',
				name: 'Base Food Equivalent',
				x: graphPoints.map((point) => point.targetCitizen - 1),
				y: graphPoints.map((point) => point.baseFoodEquiv),
				line: { color: '#cf7be8', width: 2, dash: 'dot' },
				customdata: graphPoints.map((point) => [
					point.effectiveFood,
					point.totalFoodPct,
					totalGrowthPct
				]),
				hovertemplate:
					'Base food equivalent: %{y}<br>' +
					'Food to accumulate: %{customdata[0]}<br>' +
					'Food yield bonus: +%{customdata[1]}%<br>' +
					'Growth bonus: +%{customdata[2]}%<extra></extra>'
			});
		}

		const annotationLines: string[] = [`Food kept: +${totalCarryoverPercent}%`];
		if (totalGrowthPct > 0) annotationLines.push(`Growth bonus: +${totalGrowthPct}%`);
		const sampleFoodPct = graphPoints.length > 0 ? graphPoints[Math.floor(graphPoints.length / 2)].totalFoodPct : 0;
		if (sampleFoodPct > 0) annotationLines.push(`Food yield bonus: +${sampleFoodPct}%`);

		return {
			traces,
			layout: {
				autosize: true,
				title: {
					text: 'Food needed for next Citizen Birth',
					font: { family: 'Tw Cen MT, sans-serif', size: 19, color: 'rgba(250, 250, 196, 1)' }
				},
				font: { family: 'Tw Cen MT, sans-serif', color: 'rgba(250, 250, 196, 1)' },
				uirevision: 'growth',
				paper_bgcolor: '#070b0eff',
				plot_bgcolor: '#070b0eff',
				margin: { l: 70, r: 30, t: 80, b: 60 },
				xaxis: {
					title: { text: 'Current population (before growth)', font: { size: 16 } },
					gridcolor: 'rgba(100, 100, 100, 0.3)',
					zerolinecolor: 'rgba(207, 175, 115, 0.8)',
					tickfont: { size: 14 },
					tickmode: 'linear',
					dtick: 2
				},
				yaxis: {
					title: { text: 'Food', font: { size: 16 } },
					gridcolor: 'rgba(100, 100, 100, 0.3)',
					zerolinecolor: 'rgba(207, 175, 115, 0.8)',
					tickfont: { size: 14 },
					...(lockedYRangeGrowth
						? { autorange: false, range: lockedYRangeGrowth }
						: { rangemode: 'tozero' })
				},
				hovermode: 'x unified',
				showlegend: true,
				legend: {
					x: 0.01,
					y: 1,
					bordercolor: 'rgba(207, 175, 115, 1)',
					borderwidth: 1,
					font: { size: 14 }
				},
				annotations: [
					{
						xref: 'paper',
						yref: 'paper',
						x: 0.01,
						y: 0.82,
						xanchor: 'left',
						yanchor: 'top',
						showarrow: false,
						align: 'left',
						text: annotationLines.join('<br>'),
						font: { family: 'Tw Cen MT, sans-serif', size: 13, color: 'rgba(250, 250, 196, 0.72)' },
						bgcolor: 'rgba(7, 11, 14, 0.82)',
						bordercolor: 'rgba(207, 175, 115, 0.45)',
						borderwidth: 1,
						borderpad: 4
					}
				],
				dragmode: 'pan'
			}
		};
	}

	function buildRatioPlot() {
		const traces = GRAPH_YIELDS.map((yieldInfo) => ({
			type: 'scatter',
			mode: 'lines',
			name: yieldInfo.label,
			x: graphPoints.map((point) => point.targetCitizen - 1),
			y: graphPoints.map((point) => {
				const amount = point.yields[yieldInfo.type].amount;
				return amount > 0 && point.baseFoodEquiv > 0 ? amount / point.baseFoodEquiv : null;
			}),
			line: { color: yieldInfo.color, width: 2.5, shape: 'spline', smoothing: 0.45 },
			customdata: graphPoints.map((point) => [
				point.yields[yieldInfo.type].amount,
				point.baseFoodEquiv,
				ERA_DEFAULTS[point.eraType].name,
				point.eraMultiplier,
				point.yields[yieldInfo.type].contributions
					.map((contribution) => `${contribution.sourceName}: ${contribution.amount}`)
					.join('<br>')
			]),
			hovertemplate:
				`${yieldInfo.label} gained: %{customdata[0]}<br>` +
				'Base food equivalent: %{customdata[1]}<br>' +
				'Yield per raw food: %{y:.4f}<br>' +
				'Era step: %{customdata[2]} (x%{customdata[3]})<extra></extra>',
			connectgaps: false
		}));

		return {
			traces,
			layout: {
				autosize: true,
				title: {
					text: 'Yield-Per-Food Ratio On Citizen Birth',
					font: { family: 'Tw Cen MT, sans-serif', size: 19, color: 'rgba(250, 250, 196, 1)' }
				},
				font: { family: 'Tw Cen MT, sans-serif', color: 'rgba(250, 250, 196, 1)' },
				uirevision: 'ratio',
				paper_bgcolor: '#070b0eff',
				plot_bgcolor: '#070b0eff',
				margin: { l: 70, r: 30, t: 80, b: 60 },
				xaxis: {
					title: { text: 'Current population (before growth)', font: { size: 16 } },
					gridcolor: 'rgba(100, 100, 100, 0.3)',
					zerolinecolor: 'rgba(207, 175, 115, 0.8)',
					tickfont: { size: 14 },
					tickmode: 'linear',
					dtick: 2
				},
				yaxis: {
					title: { text: 'Yield gained per 1 raw food', font: { size: 16 } },
					gridcolor: 'rgba(100, 100, 100, 0.3)',
					zerolinecolor: 'rgba(207, 175, 115, 0.8)',
					tickfont: { size: 14 },
					...(lockedYRangeRatio
						? { autorange: false, range: lockedYRangeRatio }
						: { rangemode: 'tozero' })
				},
				hovermode: 'x unified',
				showlegend: true,
				legend: {
					x: 0.8,
					y: 1,
					bordercolor: 'rgba(207, 175, 115, 1)',
					borderwidth: 1,
					font: { size: 14 }
				},
				dragmode: 'pan'
			}
		};
	}

	const plotConfig = {
		scrollZoom: true,
		displayModeBar: true,
		displaylogo: false,
		responsive: true,
		showEditInChartStudio: false,
		plotlyServerURL: 'https://chart-studio.plotly.com',
		toImageButtonOptions: {
			filename: 'civ5vp_population_growth',
			format: 'svg'
		},
		modeBarButtonsToRemove: ['lasso2d', 'select2d']
	};

	function preserveTraceVisibility(plotDiv: HTMLDivElement, traces: Array<Record<string, unknown>>) {
		const currentData = (plotDiv as unknown as { data?: Array<Record<string, unknown>> }).data;
		if (!currentData) {
			return;
		}

		const visibilityByName = new Map<string, boolean | 'legendonly'>();
		for (const trace of currentData) {
			if (typeof trace.name === 'string' && trace.visible !== undefined) {
				visibilityByName.set(trace.name, trace.visible as boolean | 'legendonly');
			}
		}

		for (const trace of traces) {
			if (typeof trace.name !== 'string') {
				continue;
			}
			const saved = visibilityByName.get(trace.name);
			if (saved !== undefined) {
				(trace as { visible?: boolean | 'legendonly' }).visible = saved;
			}
		}
	}

	function captureYRanges() {
		type PlotlyDiv = { _fullLayout?: { yaxis?: { range?: [number, number] } } };
		const gLayout = (growthPlotDiv as unknown as PlotlyDiv)?._fullLayout;
		const rLayout = (ratioPlotDiv as unknown as PlotlyDiv)?._fullLayout;
		if (gLayout?.yaxis?.range) lockedYRangeGrowth = [...gLayout.yaxis.range] as [number, number];
		if (rLayout?.yaxis?.range) lockedYRangeRatio = [...rLayout.yaxis.range] as [number, number];
	}

	const throttledUpdate = createThrottle(() => {
		if (!Plotly || !initialized || !growthPlotDiv || !ratioPlotDiv) {
			return;
		}

		if (activeGraph === 'growth') {
			const growthPlot = buildGrowthPlot();
			preserveTraceVisibility(growthPlotDiv, growthPlot.traces as Array<Record<string, unknown>>);
			Plotly.react(growthPlotDiv, growthPlot.traces, growthPlot.layout, plotConfig);
			captureYRanges();
		} else {
			const ratioPlot = buildRatioPlot();
			preserveTraceVisibility(ratioPlotDiv, ratioPlot.traces as Array<Record<string, unknown>>);
			Plotly.react(ratioPlotDiv, ratioPlot.traces, ratioPlot.layout, plotConfig);
			captureYRanges();
		}
	}, 16);

	onMount(async () => {
		const module = await import('plotly.js-dist');
		Plotly = module.default;
	});

	$effect(() => {
		if (!Plotly || !growthPlotDiv || !ratioPlotDiv || initialized) {
			return;
		}

		initialized = true;
		const growthPlot = buildGrowthPlot();
		const ratioPlot = buildRatioPlot();
		Plotly.newPlot(growthPlotDiv, growthPlot.traces, growthPlot.layout, plotConfig);
		Plotly.newPlot(ratioPlotDiv, ratioPlot.traces, ratioPlot.layout, plotConfig);
		captureYRanges();
	});

	$effect(() => {
		if (!initialized || !Plotly) {
			return;
		}

		// Resize the newly-shown plot when switching tabs.
		const div = activeGraph === 'growth' ? growthPlotDiv : ratioPlotDiv;
		if (div) {
			Plotly.Plots.resize(div);
		}
	});

	$effect(() => {
		if (!initialized) {
			return;
		}

		// When the citizen range changes, the data domain changes — reset the locked axis range
		// so the next render re-autoranges to fit the new data.
		void minCitizen;
		void maxCitizen;
		lockedYRangeGrowth = null;
		lockedYRangeRatio = null;
	});

	$effect(() => {
		if (!initialized) {
			return;
		}

		graphPoints;
		activeOutputYieldTypes;
		cityIsCapital;
		throttledUpdate();
	});

	function onDividerPointerDown(event: PointerEvent) {
		event.preventDefault();
		isDragging = true;
		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);
	}

	function onDividerPointerMove(event: PointerEvent) {
		if (!isDragging || !pageContainer) {
			return;
		}

		const containerRect = pageContainer.getBoundingClientRect();
		const newWidth = event.clientX - containerRect.left;
		const maxWidth = containerRect.width * 0.6;
		panelWidth = Math.max(260, Math.min(newWidth, maxWidth));
	}

	function onDividerPointerUp() {
		if (!isDragging) {
			return;
		}

		isDragging = false;
		if (Plotly && initialized) {
			const div = activeGraph === 'growth' ? growthPlotDiv : ratioPlotDiv;
			if (div) {
				Plotly.Plots.resize(div);
			}
		}
	}
	</script>

<div class="page-container" class:dragging={isDragging} bind:this={pageContainer}>
	<div class="control-panel" style:width={panelWidth !== null ? `${panelWidth}px` : undefined}>
		{#if showGraphModeSwitcher}
			<div class="graph-mode-section">
				<label for="graph-mode-select" class="graph-mode-label">Graph Selection:</label>
				<select id="graph-mode-select" bind:value={graphMode} class="graph-mode-select">
					<option value="gold-vs-production">Gold Cost vs Production</option>
					<option value="ratio-vs-gridx">Gold/Production Ratio vs Tech Column</option>
					<option value="combat-efficiency">Combat Strength / Cost Efficiency</option>
					<option value="population-growth">Population Growth And Its Yields</option>
				</select>
			</div>
		{/if}

		<div class="graph-tab-toggle">
			<button
				class="graph-tab"
				class:active={activeGraph === 'ratio'}
				onclick={() => (activeGraph = 'ratio')}
			>Yield / Food Ratios</button>
			<button
				class="graph-tab"
				class:active={activeGraph === 'growth'}
				onclick={() => (activeGraph = 'growth')}
			>Growth Threshold</button>
		</div>

		<div class="panel-intro">
			<p class="eyebrow">Population Growth and Its Yields</p>
			<h1>Citizen Birth Curves</h1>
			{#if activeGraph === 'ratio'}
				<p>Yield gained on each citizen birth divided by the base food equivalent — how much yield each raw food unit earns you.</p>
			{:else}
				<p>Net food needed to birth each citizen after food kept from the previous growth event.</p>
			{/if}
		</div>

		<section class="control-section">
			<h2>City Setup</h2>
			<label class="field-label">
				<span>Game speed</span>
				<select bind:value={gameSpeedType}>
					<option value="GAMESPEED_QUICK">Quick</option>
					<option value="GAMESPEED_STANDARD">Standard</option>
					<option value="GAMESPEED_EPIC">Epic</option>
					<option value="GAMESPEED_MARATHON">Marathon</option>
				</select>
			</label>

			<label class="field-label">
				<span>Lowest citizen on X axis</span>
				<input type="number" min="1" max="119" bind:value={minCitizen} />
			</label>

			<label class="field-label">
				<span>Highest citizen on X axis</span>
				<input type="number" min="10" max="120" bind:value={maxCitizen} />
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={cityIsCapital} />
				<span>City is the capital</span>
			</label>

			<p class="helper-text">
				Era-scaled birth yields follow VP's DLL multiplier: Ancient and Classical are x1, then each later era steps up by 1.
			</p>
		</section>

		<section class="control-section">
			<h2>Growth Modifiers</h2>
			<p class="helper-text">
				Stack additively. Applied to the net food surplus (after consumption) each turn, multiplying how fast the city fills its growth threshold.
			</p>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={isWLTKD} />
				<span>We Love the King Day <span class="mod-badge">+25%</span></span>
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={rationalistOpener} />
				<span>Rationalism (opener) <span class="mod-badge">+10%</span></span>
			</label>

			<label class="field-label">
				<span>Extra Rationalism policies <span class="mod-badge">+5% each</span></span>
				<input type="number" min="0" max="5" bind:value={rationalistExtra} />
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={peaceAndBread} />
				<span>Peace, Land, Bread (Order) <span class="mod-badge">+20%</span></span>
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={goddessBelief} />
				<span>Goddess of the Home (Pantheon) <span class="mod-badge">+25%</span></span>
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={dagdaBelief} />
				<span>Dagda (Celtic Pantheon) <span class="mod-badge">+25%</span></span>
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={isGoldenAge} />
				<span>Golden Age active</span>
			</label>

			{#if isGoldenAge}
				<div class="nested-controls">
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={niloGoldenAge} />
						<span>Nilometer (Egyptian) <span class="mod-badge">+10%</span></span>
					</label>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={emancipationGoldenAge} />
						<span>Emancipation (Rationalism) <span class="mod-badge">+10%</span></span>
					</label>
				</div>
			{/if}

			<label class="field-label">
				<span>Local happiness<span class="mod-badge">+2% per point</span></span>
				<input type="number" min="0" max="50" bind:value={localHappinessDelta} />
			</label>
			<p class="condition-note">Local happiness − local unhappiness. Each point adds +2% growth (LOCAL_HAPPINESS_FOOD_MODIFIER = 2). The happiness contribution itself is capped at ±100, but the total growth modifier has no upper cap.</p>

			<label class="field-label">
				<span>Trade route growth bonus <span class="mod-badge">% total</span></span>
				<input type="number" min="0" bind:value={tradeRouteGrowthPct} />
			</label>
			<p class="condition-note">Total growth % from outgoing trade routes sent to cities of civs you have Cultural Influence over. Each such route contributes a bonus; enter the combined total here.</p>

			{#if totalGrowthPct > 0}
				<p class="modifier-total">Total: <strong>+{totalGrowthPct}%</strong> growth</p>
			{/if}
		</section>

		<section class="control-section">
			<h2>Food Yield Modifiers</h2>
			<p class="helper-text">
				Stack additively. Applied to gross food output before subtracting consumption, and before growth modifiers.
			</p>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={foodTempleArtemis} />
				<span>Temple of Artemis (Wonder) <span class="mod-badge">+10%</span></span>
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={foodIFC} />
				<span>International Finance Center <span class="mod-badge">+5%</span></span>
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={foodThroneRoom} disabled={!cityIsCapital} />
				<span class:dimmed={!cityIsCapital}>Throne Room <span class="mod-badge">+10%</span> <span class="condition-note">(capital only)</span></span>
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={foodGurdwara} />
				<span>Gurdwara (Belief building) <span class="mod-badge">+10%</span></span>
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={foodHarappan} />
				<span>Harappan Reservoir (Indian UB) <span class="mod-badge">+1% per follower</span></span>
			</label>
			<p class="condition-note">Same building as in the sources list — this controls only its food rate bonus. Enable both to model the full building.</p>

			{#if foodHarappan}
				<div class="nested-controls">
					<label class="field-label">
						<span>Majority followers (% of pop, default 95)</span>
						<input type="number" min="0" max="100" bind:value={harappanFollowerPct} />
					</label>
					<p class="helper-text">
						Followers = ⌊population × {harappanFollowerPct}%⌋. Bonus grows with each new citizen.
					</p>
				</div>
			{/if}
		</section>

		<section class="control-section">
			<h2>Output-Scaled Birth Yields</h2>
			{#if activeOutputYieldTypes.length > 0}
				{#each activeOutputYieldTypes as yieldType}
					<label class="field-label">
						<span>{GRAPH_YIELDS.find((entry) => entry.type === yieldType)?.label} per turn</span>
						<input
							type="number"
							min="0"
							value={cityOutputByYield[yieldType]}
							oninput={(event) => updateCityOutput(yieldType, event.currentTarget.valueAsNumber)}
						/>
					</label>
				{/each}
			{:else}
				<p class="helper-text">No active sources currently convert birth events from city output.</p>
			{/if}
		</section>

		<section class="control-section">
			<h2>Era Thresholds</h2>
			<div class="threshold-list">
				{#each eraThresholds as threshold, index}
					<div class="threshold-row">
						<input
							type="number"
							min="2"
							value={threshold.citizen}
							oninput={(event) => updateEraThresholdCitizen(index, event.currentTarget.valueAsNumber)}
							onchange={(event) => commitEraThresholdCitizen(index, event.currentTarget.valueAsNumber)}
							onblur={(event) => commitEraThresholdCitizen(index, event.currentTarget.valueAsNumber)}
						/>
						<select
							value={threshold.eraType}
							onchange={(event) => updateEraThresholdEra(index, event.currentTarget.value as EraType)}
						>
							{#each ERA_OPTIONS as era}
								<option value={era.type}>{era.name}</option>
							{/each}
						</select>
						<button
							class="icon-button"
							type="button"
							disabled={eraThresholds.length <= 1}
							onclick={() => removeEraThreshold(index)}
						>
							Remove
						</button>
					</div>
				{/each}
			</div>
			<button class="secondary-button full-width" type="button" onclick={resetEraThresholds}>
				Reset Era Thresholds
			</button>
		</section>

		<section class="control-section">
			<div class="section-heading-row">
				<h2>Buildings</h2>
				<button class="secondary-button" type="button" onclick={resetBuildings}>Reset</button>
			</div>
			<div class="source-list">
				{#each POPULATION_GROWTH_BUILDING_SOURCES as source}
					<div class="source-row">
						<input
							type="checkbox"
							class="source-checkbox"
							checked={enabledBuildingTypes.has(source.type)}
							onchange={(event) => toggleBuilding(source.type, event.currentTarget.checked)}
						/>
						<div class="source-info">
							<div class="source-row-header">
								<span class="source-name">{source.name}</span>
								{#if source.isUnique}<span class="badge unique">Unique</span>{/if}
								{#if source.unlockedByBelief}<span class="badge belief">Belief</span>{/if}
								{#if source.isNationalWonder}<span class="badge wonder">National</span>{/if}
								{#if source.isWonder && !source.isNationalWonder}<span class="badge wonder">Wonder</span>{/if}
								{#if source.carryoverPercent > 0}<span class="carryover-tag">+{source.carryoverPercent}% food</span>{/if}
							</div>
							{#if source.birthYields.length > 0}
								<div class="yield-line">{source.birthYields.map((f) => formatBirthYield(f)).join(', ')}</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>

		<section class="control-section">
			<div class="section-heading-row">
				<h2>Policies</h2>
				<button class="secondary-button" type="button" onclick={resetGlobalSources}>Reset Global Sources</button>
			</div>
			<div class="source-list">
				{#each POPULATION_GROWTH_GLOBAL_SOURCES.filter((source) => source.kind === 'policy') as source}
					<div class="source-row">
						<input
							type="checkbox"
							class="source-checkbox"
							checked={enabledGlobalSourceTypes.has(source.type)}
							onchange={(event) => toggleGlobalSource(source.type, event.currentTarget.checked)}
						/>
						<div class="source-info">
							<div class="source-row-header">
								<span class="source-name">{source.name}</span>
								<span class="scope-tag">{source.scope}</span>
							</div>
							<div class="yield-line">{source.birthYields.map((f) => formatBirthYield(f)).join(', ')}</div>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<section class="control-section">
			<h2>Beliefs</h2>
			<div class="source-list">
				{#each POPULATION_GROWTH_GLOBAL_SOURCES.filter((source) => source.kind === 'belief') as source}
					<div class="source-row">
						<input
							type="checkbox"
							class="source-checkbox"
							checked={enabledGlobalSourceTypes.has(source.type)}
							onchange={(event) => toggleGlobalSource(source.type, event.currentTarget.checked)}
						/>
						<div class="source-info">
							<div class="source-row-header">
								<span class="source-name">{source.name}</span>
								<span class="scope-tag">{source.scope}</span>
							</div>
							<div class="yield-line">{source.birthYields.map((f) => formatBirthYield(f)).join(', ')}</div>
						</div>
					</div>
				{/each}
			</div>
		</section>
	</div>

	<div
		class="panel-divider"
		role="separator"
		aria-orientation="vertical"
		onpointerdown={onDividerPointerDown}
		onpointermove={onDividerPointerMove}
		onpointerup={onDividerPointerUp}
		onpointercancel={onDividerPointerUp}
	></div>

	<div class="graph-panel">
		<div class="plot-surface" bind:this={ratioPlotDiv} class:graph-hidden={activeGraph !== 'ratio'}></div>
		<div class="plot-surface" bind:this={growthPlotDiv} class:graph-hidden={activeGraph !== 'growth'}></div>
	</div>
</div>

<style>
	.page-container {
		display: flex;
		height: 100vh;
		width: 100%;
		color: rgba(250, 250, 196, 1);
		font-family: 'Tw Cen MT', 'Segoe UI', sans-serif;
	}

	.graph-mode-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding: 0.5rem;
		background-color: rgba(100, 100, 150, 0.1);
		border: 1px solid rgba(207, 175, 115, 1);
	}

	.graph-mode-label {
		font-weight: 600;
		font-size: 0.95rem;
		color: #e6cd1a;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.graph-mode-select {
		padding: 0.75rem 0.75rem;
		background-color: rgba(100, 100, 150, 0.3);
		border: 1px solid #ffc864;
		color: rgba(250, 250, 196, 1);
		font-family: 'Tw Cen MT', sans-serif;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.2s ease;
		outline: none;
	}

	.graph-mode-select:hover {
		background-color: rgba(100, 100, 150, 0.5);
		border-color: #e6cd1a;
		box-shadow: 0 0 8px rgba(255, 200, 100, 0.3);
	}

	.graph-mode-select:focus {
		background-color: rgba(100, 100, 150, 0.5);
		border-color: #4a9eff;
		box-shadow: 0 0 8px rgba(74, 158, 255, 0.3);
	}

	.graph-mode-select option,
		select option {
		background-color: #1a1a2e;
		color: rgba(250, 250, 196, 1);
		padding: 0.5rem;
	}

	.control-panel {
		width: clamp(320px, 25vw, 420px);
		flex-shrink: 0;
		padding: 0.5rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		background-color: #070b0eff;
		border-right: 1px solid rgba(207, 175, 115, 1);
		transition: width 0.2s ease;
	}

	.dragging .control-panel {
		transition: none;
	}

	.panel-divider {
		width: 5px;
		flex-shrink: 0;
		background: rgba(207, 175, 115, 1);
		cursor: col-resize;
		transition: background 0.15s;
		position: relative;
	}

	.panel-divider::before {
		content: '';
		position: absolute;
		inset: 0 -4px;
		z-index: 1;
	}

	.panel-divider:hover,
	.dragging .panel-divider {
		background: #4a9eff;
	}

	.dragging {
		user-select: none;
		cursor: col-resize;
	}

	.panel-intro {
		padding: 0.5rem;
		padding-bottom: 0.5rem;
		background-color: #070b0eff;
		border: 1px solid rgba(207, 175, 115, 1);
	}

	.eyebrow {
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		font-size: 0.72rem;
		color: #e6cd1a;
	}

	h1,
	h2 {
		margin: 0;
		font-weight: 600;
	}

	h1 {
		font-size: 2rem;
		margin-top: 0.2rem;
	}

	.control-panel h2 {
		margin: 0;
		padding-bottom: 0.375rem;
		border-bottom: 2px solid #4a9eff;
		font-size: 1.4rem;
		color: rgba(250, 250, 196, 1);
	}

	.panel-intro p:last-child,
		.helper-text,
		.field-label span,
		.source-subtitle {
		color: rgba(250, 250, 196, 0.75);
	}

	.control-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.5rem;
		background-color: #070b0eff;
		border: 1px solid rgba(207, 175, 115, 1);
	}

	.section-heading-row {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}

	.field-label {
		display: grid;
		gap: 0.4rem;
		font-size: 0.96rem;
	}

	input[type='number'],
	select {
		width: 100%;
		box-sizing: border-box;
		padding: 0.375rem 0.375rem;
		background-color: rgba(100, 100, 150, 0.3);
		border: 1px solid #ffc864;
		border-radius: 0;
		color: rgba(250, 250, 196, 1);
		font-family: 'Tw Cen MT', sans-serif;
		font-size: 0.95rem;
		transition: all 0.2s ease;
		outline: none;
	}

	input[type='number']:hover,
	select:hover {
		background-color: rgba(100, 100, 150, 0.5);
		border-color: #e6cd1a;
		box-shadow: 0 0 8px rgba(255, 200, 100, 0.3);
	}

	input[type='number']:focus,
	select:focus {
		background-color: rgba(100, 100, 150, 0.5);
		border-color: #4a9eff;
		box-shadow: 0 0 8px rgba(74, 158, 255, 0.3);
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0;
		cursor: pointer;
		font-size: 0.85rem;
		color: rgba(250, 250, 196, 1);
	}

	.checkbox-label input[type='checkbox'] {
		width: 16px;
		height: 16px;
		cursor: pointer;
		accent-color: #ffc864;
	}

	.secondary-button,
	.icon-button {
		border: 1px solid #e6cd1a;
		background-color: rgba(230, 205, 26, 0.2);
		color: rgba(250, 250, 196, 1);
		border-radius: 0;
		padding: 0.22rem 0.4rem;
		font-family: 'Tw Cen MT', sans-serif;
		font-size: 0.85rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.secondary-button:hover,
	.icon-button:hover {
		background-color: rgba(230, 205, 26, 0.3);
	}

	.secondary-button.full-width {
		width: 100%;
	}

	.threshold-list {
		display: grid;
		gap: 0.6rem;
	}

	.threshold-row {
		display: grid;
		grid-template-columns: 88px minmax(0, 1fr) auto;
		gap: 0.6rem;
	}

	.source-list {
		display: flex;
		flex-direction: column;
		border: 1px solid rgba(100, 100, 150, 0.3);
	}

	.source-row {
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
		padding: 0.22rem 0.3rem;
		border-bottom: 1px solid rgba(220, 186, 107, 0.08);
	}

	.source-row:last-child {
		border-bottom: none;
	}

	.source-checkbox {
		margin-top: 0.22rem;
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		accent-color: #ffc864;
		cursor: pointer;
	}

	.source-info {
		display: flex;
		flex-direction: column;
		gap: 0.18rem;
		min-width: 0;
	}

	.source-row-header {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.source-name {
		font-size: 0.85rem;
		color: rgba(250, 250, 196, 1);
	}

	.carryover-tag {
		font-size: 0.72rem;
		color: #64c864;
		font-family: 'Consolas', monospace;
		margin-left: auto;
		white-space: nowrap;
	}

	.scope-tag {
		font-size: 0.7rem;
		color: rgba(250, 250, 196, 0.45);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-left: auto;
		white-space: nowrap;
	}

	.yield-line {
		font-size: 0.74rem;
		color: rgba(250, 250, 196, 0.55);
		line-height: 1.35;
		word-break: break-word;
	}

	.badge {
		padding: 0.14rem 0.5rem;
		border-radius: 3px;
		font-size: 0.7rem;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		border: 1px solid rgba(207, 175, 115, 0.6);
	}

	.badge.unique {
		color: #ff9f7f;
	}

	.badge.wonder {
		color: #e6cd1a;
	}

	.badge.belief {
		color: #64c8ff;
	}

	.mod-badge {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		border: 1px solid rgba(207, 175, 115, 0.45);
		border-radius: 3px;
		font-size: 0.72rem;
		color: #ffc864;
		letter-spacing: 0.02em;
		vertical-align: middle;
	}

	.nested-controls {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-left: 1.25rem;
		border-left: 2px solid rgba(207, 175, 115, 0.3);
	}

	.modifier-total {
		font-size: 0.9rem;
		color: #7ecb4d;
		margin: 0;
		padding: 0.25rem 0.4rem;
		background: rgba(126, 203, 77, 0.08);
		border: 1px solid rgba(126, 203, 77, 0.3);
	}

	.condition-note {
		font-size: 0.75rem;
		color: rgba(250, 250, 196, 0.45);
	}

	.dimmed {
		opacity: 0.45;
	}

	.graph-panel {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.plot-surface {
		flex: 1;
		width: 100%;
		height: 100%;
		min-height: 0;
		background: #070b0eff;
	}

	.graph-hidden {
		display: none;
	}

	.graph-tab-toggle {
		display: flex;
		gap: 0;
		border: 1px solid rgba(207, 175, 115, 1);
	}

	.graph-tab {
		flex: 1;
		padding: 0.45rem 0.6rem;
		background: transparent;
		border: none;
		border-right: 1px solid rgba(207, 175, 115, 0.5);
		color: rgba(250, 250, 196, 0.6);
		font-family: 'Tw Cen MT', 'Segoe UI', sans-serif;
		font-size: 0.85rem;
		cursor: pointer;
		text-align: center;
		transition: background 0.15s, color 0.15s;
	}

	.graph-tab:last-child {
		border-right: none;
	}

	.graph-tab:hover {
		background: rgba(207, 175, 115, 0.1);
		color: rgba(250, 250, 196, 0.9);
	}

	.graph-tab.active {
		background: rgba(207, 175, 115, 0.18);
		color: rgba(250, 250, 196, 1);
		font-weight: 600;
	}

	:global(.plot-surface .plotly) {
		height: 100% !important;
		background: #070b0eff;
	}

	:global(.plot-surface .main-svg) {
		background: transparent !important;
	}

	@media (max-width: 1100px) {
		.page-container {
			flex-direction: column;
			height: auto;
		}

		.control-panel {
			width: 100% !important;
			border-right: none;
			border-bottom: 1px solid rgba(207, 175, 115, 1);
		}

		.panel-divider {
			display: none;
		}
	}

	@media (max-width: 720px) {
		.section-heading-row,
		.threshold-row {
			grid-template-columns: 1fr;
			flex-direction: column;
			align-items: start;
		}
	}
</style>