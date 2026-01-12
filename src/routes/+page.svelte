<script lang="ts">
	import Plotly from 'plotly.js-dist';
	import { createThrottle } from '$lib/utils/throttle';
	import {
		getUnitPurchaseCost,
		getBuildingPurchaseCost,
		GOLD_PURCHASE_CONSTANTS_VP,
		type GoldPurchaseConstants
	} from '$lib/formulas/gold-purchase';
	import { GAME_SPEED_DEFAULTS, GAME_CONSTANTS_VP_DEFAULTS, type GameContext } from '$lib/types/game-context';
	import { parseCostFromHelp, stripColorTags } from '$lib/utils/civilopedia-parser';
	import {
		buildTechProgressData,
		getEstimatedTechsAtGridX,
		getEstimatedTechProgressAtGridX,
		getGridXFromPrereqTech,
		buildProductionGridXCorrelation,
		getEstimatedTechsFromProductionCorrelation,
		getEstimatedTechProgressFromProductionCorrelation,
		type TechProgressData,
		type ProductionGridXCorrelation,
		type ProductionGridXDataPoint
	} from '$lib/utils/tech-progress';
	import {
		findHurryModifierBuildings,
		getIndustryPolicyModifiers,
		calculateTotalHurryModifier,
		type HurryModifierSource
	} from '$lib/utils/hurry-modifiers';
	import civilopediaData from '$lib/data/civilopedia_export.json';
	import type { Unit, Building, Technology } from '$lib/types/civilopedia';

	// =============================================================================
	// TYPES
	// =============================================================================

	interface MeleeUnitData {
		name: string;
		productionCost: number;
		combat: number;
		eraName: string;
		techGridX: number; // GridX of the prerequisite tech
	}

	interface BuildingData {
		name: string;
		productionCost: number;
		eraName: string;
		techGridX: number; // GridX of the prerequisite tech
	}

	// =============================================================================
	// CONSTANTS
	// =============================================================================

	
	const MELEE_UNIT_CLASSES = [
		'UNITCLASS_WARRIOR',
		'UNITCLASS_SPEARMAN',
		'UNITCLASS_PIKEMAN',
		'UNITCLASS_TERCIO',
		'UNITCLASS_RIFLEMAN',
		'UNITCLASS_GREAT_WAR_INFANTRY',
		'UNITCLASS_INFANTRY',
		'UNITCLASS_MECHANIZED_INFANTRY',
		'UNITCLASS_XCOM_SQUAD'
	];

	// =============================================================================
	// STATE
	// =============================================================================
	let colour_set = [
		'rgb(228, 26, 28)',
		'rgb(0, 111, 161)',
		'rgb(77, 175, 74)',
		'rgb(152, 78, 163)',
		'rgb(230, 207, 26)',
		'rgb(255, 90, 0)',
		'rgb(166, 86, 40)',
		'rgb(46, 172, 212)',
		'rgb(153, 153, 153)',
		'rgb(27, 158, 119)',
		'rgb(217, 95, 2)',
		'rgb(117, 112, 179)',
		'rgb(231, 41, 138)',
		'rgb(130, 201, 53)',
		'rgb(230, 171, 2)',
		'rgb(166, 118, 29)',
		'rgb(55, 145, 0)',
		'rgb(254, 90, 206)',
		'rgb(255, 0, 100)'
	];

	let plotDiv: HTMLDivElement | undefined = $state();
	let initialized = $state(false);

	// Dropdown for graph selection
	type GraphMode = 'gold-vs-production' | 'ratio-vs-gridx';
	let graphMode: GraphMode = $state('ratio-vs-gridx');

	// Hurry modifier toggles
	let enabledHurryModifiers = $state(new Set<string>());
	let enableIndustryPolicies = $state(false);
	let industryPolicyCount = $state(0); // 0-7 (opener + 5 policies + finisher)

	// Display options
	let showMarkers = $state(true);

	// Editable upgrade formula parameters
	let upgradeCoefficient = $state(1.0); // Multiplier for production difference
	let upgradeConstant = $state(10); // Base cost added to upgrade

	// Game context (Standard speed for now)
	const gameContext: GameContext = {
		gameSpeed: GAME_SPEED_DEFAULTS.GAMESPEED_STANDARD,
		startEra: {
			id: 0,
			type: 'ERA_ANCIENT',
			name: 'Ancient Era',
			growthPercent: 100,
			trainPercent: 100,
			constructPercent: 100,
			researchPercent: 100
		},
		currentEra: {
			id: 0,
			type: 'ERA_ANCIENT',
			name: 'Ancient Era',
			growthPercent: 100,
			trainPercent: 100,
			constructPercent: 100,
			researchPercent: 100
		},
		handicap: {
			id: 4,
			type: 'HANDICAP_PRINCE',
			name: 'Prince',
			aiProductionPercent: 100,
			aiResearchPercent: 100,
			aiGrowthPercent: 100,
			playerResearchPercent: 100,
			playerHappinessDefault: 0
		},
		constants: { ...GAME_CONSTANTS_VP_DEFAULTS }
	};

	// =============================================================================
	// DATA EXTRACTION
	// =============================================================================

	// Build tech progress data for mapping production costs to tech counts
	const techProgressData: TechProgressData = buildTechProgressData(
		(civilopediaData as { technologies: Technology[] }).technologies
	);

	/**
	 * Extract standard melee units from civilopedia data
	 * Filters out unique units (those with Replaces) and barbarian units
	 */
	function getMeleeUnits(): MeleeUnitData[] {
		const units = (civilopediaData as { units: Unit[] }).units;
		const meleeUnits: MeleeUnitData[] = [];

		for (const unit of units) {
			const unitClass = unit.Class;
			const name = unit.Name;
			const replaces = unit.Replaces;

			// Filter: is in melee class AND is NOT a replacement (unique unit) AND is NOT barbarian
			const isUniqueUnit = replaces && Object.keys(replaces).length > 0;
			const isBarbarian = name.includes('Barbarian');

			if (MELEE_UNIT_CLASSES.includes(unitClass) && !isUniqueUnit && !isBarbarian) {
				const costs = parseCostFromHelp(unit.Help);
				if (costs) {
					// Get the actual GridX from the unit's prerequisite tech
					const techGridX = getGridXFromPrereqTech(techProgressData, unit.PrereqTech);
					meleeUnits.push({
						name: stripColorTags(name),
						productionCost: costs.production,
						combat: unit.Combat,
						eraName: unit.EraName,
						techGridX
					});
				}
			}
		}

		// Sort by production cost
		return meleeUnits.sort((a, b) => a.productionCost - b.productionCost);
	}

	const meleeUnits = getMeleeUnits();

	/**
	 * Build unit production-to-GridX correlation from melee unit data.
	 * This uses the actual prerequisite tech GridX values of melee units
	 * to create an accurate mapping from production cost to tech progression.
	 */
	function buildUnitCorrelation(): ProductionGridXCorrelation {
		const dataPoints: ProductionGridXDataPoint[] = meleeUnits.map((unit) => ({
			productionCost: unit.productionCost,
			gridX: unit.techGridX,
			name: unit.name
		}));
		return buildProductionGridXCorrelation(dataPoints, 'unit');
	}

	const unitCorrelation = buildUnitCorrelation();

	/**
	 * Extract standard buildings from civilopedia data for correlation.
	 * Filters out wonders, national wonders, corporations, and unique buildings.
	 * Groups by GridX and picks a representative building at each tech level.
	 */
	function getStandardBuildings(): BuildingData[] {
		const buildings = (civilopediaData as { buildings: Building[] }).buildings;
		const buildingsByGridX = new Map<number, BuildingData[]>();

		for (const building of buildings) {
			// Filter: NOT a wonder, NOT a national wonder, NOT a corporation, NOT unique, has a prereq tech
			const isUniqueBuilding = building.Civilizations && building.Civilizations.length > 0;
			if (building.IsWonder || building.IsNationalWonder || building.IsCorporation || isUniqueBuilding) {
				continue;
			}
			if (!building.PrereqTech || building.Cost <= 0) {
				continue;
			}

			const techGridX = getGridXFromPrereqTech(techProgressData, building.PrereqTech);
			const data: BuildingData = {
				name: stripColorTags(building.Name),
				productionCost: building.Cost,
				eraName: building.EraName,
				techGridX
			};

			if (!buildingsByGridX.has(techGridX)) {
				buildingsByGridX.set(techGridX, []);
			}
			buildingsByGridX.get(techGridX)!.push(data);
		}

		// Pick one representative building per GridX (the one with median cost)
		const result: BuildingData[] = [];
		for (const [, buildingsAtGridX] of buildingsByGridX) {
			buildingsAtGridX.sort((a, b) => a.productionCost - b.productionCost);
			const medianIdx = Math.floor(buildingsAtGridX.length / 2);
			result.push(buildingsAtGridX[medianIdx]);
		}

		return result.sort((a, b) => a.productionCost - b.productionCost);
	}

	const standardBuildings = getStandardBuildings();

	/**
	 * Build building production-to-GridX correlation from building data.
	 * Uses prerequisite tech GridX values to create mapping from production cost to tech progression.
	 */
	function buildBuildingCorrelation(): ProductionGridXCorrelation {
		const dataPoints: ProductionGridXDataPoint[] = standardBuildings.map((building) => ({
			productionCost: building.productionCost,
			gridX: building.techGridX,
			name: building.name
		}));
		return buildProductionGridXCorrelation(dataPoints, 'building');
	}

	const buildingCorrelation = buildBuildingCorrelation();

	// =============================================================================
	// HURRY MODIFIER SOURCES
	// =============================================================================

	const buildings = (civilopediaData as { buildings: Building[] }).buildings;
	const hurryModifierBuildings = findHurryModifierBuildings(buildings);
	const industryPolicyModifiers = getIndustryPolicyModifiers();

	// Combine all hurry modifier sources
	const allHurryModifierSources = new Map([
		...hurryModifierBuildings,
		...industryPolicyModifiers
	]);

	// Key buildings for easy toggle access
	const STOCK_EXCHANGE_TYPE = 'BUILDING_STOCK_EXCHANGE';
	const FORBIDDEN_PALACE_TYPE = 'BUILDING_FORBIDDEN_PALACE';
	const RIALTO_DISTRICT_TYPE = 'BUILDING_RIALTO_DISTRICT';

	/**
	 * Calculate active hurry modifier based on enabled sources.
	 * 
	 * Note: In the C++ code, both player-wide and city-local hurry modifiers are added together
	 * in GetPurchaseCostFromProduction, so for visualization we combine all scopes.
	 */
	function getActiveHurryModifier(): number {
		const activeSources = new Set<string>();

		// Add enabled building modifiers
		for (const type of enabledHurryModifiers) {
			activeSources.add(type);
		}

		// Add enabled Industry policies (opener through finisher)
		if (enableIndustryPolicies && industryPolicyCount > 0) {
			const policyTypes = [
				'POLICY_COMMERCE', // Opener
				'POLICY_CARAVANS',
				'POLICY_TRADE_UNIONS',
				'POLICY_ENTREPRENEURSHIP',
				'POLICY_MERCANTILISM',
				'POLICY_PROTECTIONISM',
				'POLICY_COMMERCE_FINISHER'
			];
			for (let i = 0; i < industryPolicyCount && i < policyTypes.length; i++) {
				activeSources.add(policyTypes[i]);
			}
		}

		// Include both local and empire-wide modifiers (they stack in C++)
		return calculateTotalHurryModifier(activeSources, allHurryModifierSources, 'all');
	}

	/**
	 * Extract XP value from a building's Help text
	 * Looks for pattern like "+15 XP for" in the Help field
	 */
	function extractXPFromBuilding(building: Building): number {
		if (!building.Help) return 0;
		// Match "+XX XP for" pattern
		const match = building.Help.match(/\+(\d+)\s+XP\s+for/);
		return match ? parseInt(match[1]) : 0;
	}

	/**
	 * Build map of total XP available at each GridX
	 * Considers: Barracks (TECH_ARCHERY), Armory (TECH_STEEL), Military Academy (TECH_MILITARY_SCIENCE)
	 * Returns total XP available from that GridX onward
	 */
	function buildMilitaryXPByGridX(): Map<number, number> {
		const buildings = (civilopediaData as { buildings: Building[] }).buildings;
		const technologies = (civilopediaData as { technologies: Technology[] }).technologies;
		
		// Find the three military buildings and their GridX
		const xpBuildings: Array<{ gridX: number; xp: number; name: string }> = [];
		
		const militaryBuildingTypes = ['BUILDING_BARRACKS', 'BUILDING_ARMORY', 'BUILDING_MILITARY_ACADEMY'];
		for (const buildingType of militaryBuildingTypes) {
			const building = buildings.find((b) => b.Type === buildingType);
			if (!building) continue;
			
			const xp = extractXPFromBuilding(building);
			if (xp <= 0) continue;
			
			const gridX = getGridXFromPrereqTech(techProgressData, building.PrereqTech);
			xpBuildings.push({ gridX, xp, name: building.Name });
		}
		
		// Sort by GridX
		xpBuildings.sort((a, b) => a.gridX - b.gridX);
		
		// Build map: for each GridX in tech tree, accumulate XP from buildings at that GridX or earlier
		const xpByGridX = new Map<number, number>();
		const techs = technologies as Technology[];
		
		for (const tech of techs) {
			let totalXP = 0;
			for (const militaryBldg of xpBuildings) {
				if (militaryBldg.gridX <= tech.GridX) {
					totalXP += militaryBldg.xp;
				}
			}
			if (totalXP > 0) {
				xpByGridX.set(tech.GridX, totalXP);
			}
		}
		
		return xpByGridX;
	}

	const militaryXPByGridX = buildMilitaryXPByGridX();

	// =============================================================================
	// GRAPH COMPUTATION
	// =============================================================================

	/**
	 * Compute gold/production ratio vs Tech GridX for units and buildings
	 */
	function buildRatioVsGridXPlotData() {
		// --- UNITS ---
		const unitXs = meleeUnits.map((u) => u.techGridX);
		const unitYs = meleeUnits.map((u) => {
			const techProgress = getEstimatedTechProgressAtGridX(techProgressData, u.techGridX);
			const gold = getUnitPurchaseCost(u.productionCost, gameContext, {
				constants: GOLD_PURCHASE_CONSTANTS_VP,
				enableVPAdjustments: true,
				techProgress,
				hurryModifier: getActiveHurryModifier()
			});
			return gold / u.productionCost;
		});
		const unitNames = meleeUnits.map((u) => u.name);

		// --- BUILDINGS ---
		const buildingXs = standardBuildings.map((b) => b.techGridX);
		const buildingYs = standardBuildings.map((b) => {
			const techProgress = getEstimatedTechProgressAtGridX(techProgressData, b.techGridX);
			const gold = getBuildingPurchaseCost(b.productionCost, gameContext, {
				constants: GOLD_PURCHASE_CONSTANTS_VP,
				enableTechScaling: true,
				isInvestment: true,
				techProgress,
				hurryModifier: getActiveHurryModifier(),
				buildingHurryCostModifier: -20
			});
			// Investment only covers 50% of production cost
			return gold / (0.5 * b.productionCost);
		});
		const buildingNames = standardBuildings.map((b) => b.name);

		       // --- SMOOTH LINES (interpolated) ---
		       // Sort by GridX for smooth line
		       const sortedUnit = [...meleeUnits].sort((a, b) => a.techGridX - b.techGridX);
		       const unitLineXs = sortedUnit.map((u) => u.techGridX);
		       const unitLineYs = sortedUnit.map((u) => {
			       const techProgress = getEstimatedTechProgressAtGridX(techProgressData, u.techGridX);
			       const gold = getUnitPurchaseCost(u.productionCost, gameContext, {
				       constants: GOLD_PURCHASE_CONSTANTS_VP,
				       enableVPAdjustments: true,
				       techProgress,
				       hurryModifier: getActiveHurryModifier()
			       });
			       return gold / u.productionCost;
		       });

		       const sortedBuilding = [...standardBuildings].sort((a, b) => a.techGridX - b.techGridX);
		       const buildingLineXs = sortedBuilding.map((b) => b.techGridX);
		       const buildingLineYs = sortedBuilding.map((b) => {
			       const techProgress = getEstimatedTechProgressAtGridX(techProgressData, b.techGridX);
			       const gold = getBuildingPurchaseCost(b.productionCost, gameContext, {
				       constants: GOLD_PURCHASE_CONSTANTS_VP,
				       enableTechScaling: true,
				       isInvestment: true,
				       techProgress,
				       hurryModifier: getActiveHurryModifier(),
				       buildingHurryCostModifier: -20
			       });
			       // Investment only covers 50% of production cost
			       return gold / (0.5 * b.productionCost);
		       });

			       // --- UPGRADE RATIO TRACE ---
			       // For each upgrade step, calculate (prod_later - prod_earlier + 10) / (prod_later - prod_earlier)
			       // and plot at the later unit's GridX
			       const upgradeXs: number[] = [];
			       const upgradeYs: number[] = [];
			       const upgradeLabels: string[] = [];
			       // Melee upgrades
			       for (let i = 1; i < meleeUnits.length; i++) {
				       const prev = meleeUnits[i - 1];
				       const next = meleeUnits[i];
				       const prodDiff = next.productionCost - prev.productionCost;
				       if (prodDiff <= 0) continue; // skip degenerate
				       const goldUpgrade = prodDiff + 10;
				       const ratio = goldUpgrade / prodDiff;
				       upgradeXs.push(next.techGridX);
				       upgradeYs.push(ratio);
				       upgradeLabels.push(`${prev.name} → ${next.name}`);
			       }

			       // Ranged upgrades
			       const RANGED_UNIT_NAMES = [
				    //    'Slinger',
				       'Archer',
				       'Composite Bowman',
				       'Crossbowman',
				       'Musketman',
				       'Gatling Gun',
				       'Machine Gun',
				    //    'Bazooka'
			       ];
			       // Extract ranged units from civilopedia data
			       const units = (civilopediaData as { units: Unit[] }).units;
			       const rangedUnits = RANGED_UNIT_NAMES.map((name) => {
				       const match = units.find(u => stripColorTags(u.Name) === name && (!u.Replaces || Object.keys(u.Replaces).length === 0));
				       if (!match) return null;
				       const costs = parseCostFromHelp(match.Help);
				       if (!costs) return null;
				       return {
					       name: stripColorTags(match.Name),
					       productionCost: costs.production,
					       techGridX: getGridXFromPrereqTech(techProgressData, match.PrereqTech)
				       };
			       }).filter(Boolean) as { name: string; productionCost: number; techGridX: number }[];

			       for (let i = 1; i < rangedUnits.length; i++) {
				       const prev = rangedUnits[i - 1];
				       const next = rangedUnits[i];
				       const prodDiff = next.productionCost - prev.productionCost;
				       if (prodDiff <= 0) continue;
				       const goldUpgrade = prodDiff + 10;
				       const ratio = goldUpgrade / prodDiff;
				       upgradeXs.push(next.techGridX);
				       upgradeYs.push(ratio);
				       upgradeLabels.push(`${prev.name} → ${next.name}`);
			       }

		       const unitLineTrace: Plotly.Data = {
			       type: 'scatter',
			       mode: 'lines',
			       name: 'Unit purchase efficiency',
			       x: unitLineXs,
			       y: unitLineYs,
			       line: { color: colour_set[0], width: 2, dash: 'solid' },
			       hoverinfo: 'skip',
			       showlegend: true
		       };

		       const buildingLineTrace: Plotly.Data = {
			       type: 'scatter',
			       mode: 'lines',
			       name: 'Building investment efficiency',
			       x: buildingLineXs,
			       y: buildingLineYs,
			       line: { color: colour_set[1], width: 2, dash: 'solid' },
			       hoverinfo: 'skip',
			       showlegend: true
		       };

		       const unitTrace: Plotly.Data = {
			       type: 'scatter',
			       mode: 'text+markers',
			       name: 'Melee Units',
			       x: unitXs,
			       y: unitYs,
			       text: unitNames,
			       textposition: 'top left',
			       marker: {
				       size: 8,
				       color: colour_set[0],
				       symbol: 'circle',
				       line: { width: 1, color: 'rgba(250, 250, 196, 1)' }
			       },
			       hovertemplate:
				       '<b>%{text}</b><br>Tech Column: %{x}<br>Gold/Production: %{y:.2f}<extra>Unit</extra>'
		       };

		       const buildingTrace: Plotly.Data = {
			       type: 'scatter',
			       mode: 'text+markers',
			       name: 'Buildings (sample)',
			       x: buildingXs,
			       y: buildingYs,
			       text: buildingNames,
			       textposition: 'bottom right',
			       marker: {
				       size: 8,
				       color: colour_set[1],
				       symbol: 'circle',
				       line: { width: 1, color: 'rgba(250, 250, 196, 1)' }
			       },
			       hovertemplate:
				       '<b>%{text}</b><br>Tech Column: %{x}<br>Gold/Production: %{y:.2f}<extra>Building</extra>'
		       };

			       // Sort upgrade points by GridX for a connected line
			       const upgradePoints = upgradeXs.map((x, i) => ({ x, y: upgradeYs[i], label: upgradeLabels[i] }));
			       upgradePoints.sort((a, b) => a.x - b.x);
		       
		       const upgradeLineTrace: Plotly.Data = {
			       type: 'scatter',
			       mode: 'lines',
			       name: 'Upgrade gold cost / production saved',
			       x: upgradePoints.map(p => p.x),
			       y: upgradePoints.map(p => p.y),
			       line: { color: colour_set[2], width: 2, dash: 'solid' },
			       hoverinfo: 'skip',
			       showlegend: true
		       };

		       const upgradeMarkersTrace: Plotly.Data = {
			       type: 'scatter',
			       mode: 'text+markers',
			       name: 'Upgrade Points',
			       x: upgradePoints.map(p => p.x),
			       y: upgradePoints.map(p => p.y),
			       text: upgradePoints.map(p => p.label),
			       textposition: 'bottom left',
			       marker: {
				       size: 10,
				       color: colour_set[2],
				       symbol: 'diamond',
				       line: { width: 2, color: 'rgba(250, 250, 196, 1)' }
			       },
			       hovertemplate:
				       '<b>%{text}</b><br>Tech Column: %{x}<br>Upgrade Gold/Production: %{y:.2f}<extra>Upgrade</extra>'
		       };

		       // --- EDITABLE UPGRADE TRACE ---
		       // Calculate editable upgrade costs using user-defined formula
		       const editableUpgradePoints = upgradePoints.map(p => {
			       // Get original production difference from the ratio
			       // Original: ratio = (prodDiff + 10) / prodDiff
			       // Solve for prodDiff: prodDiff = 10 / (ratio - 1)
			       const prodDiff = 10 / (p.y - 1);
			       // Apply editable formula: gold = (prodDiff * coefficient) + constant
			       const goldUpgrade = (prodDiff * upgradeCoefficient) + upgradeConstant;
			       const newRatio = goldUpgrade / prodDiff;
			       return { x: p.x, y: newRatio, label: p.label };
		       });

		       const editableUpgradeLineTrace: Plotly.Data = {
			       type: 'scatter',
			       mode: 'lines',
			       name: 'Editable Upgrade Formula',
			       x: editableUpgradePoints.map(p => p.x),
			       y: editableUpgradePoints.map(p => p.y),
			       line: { color: colour_set[4], width: 3, dash: 'dot' },
			       hoverinfo: 'skip',
			       showlegend: true
		       };

		       const editableUpgradeMarkersTrace: Plotly.Data = {
			       type: 'scatter',
			       mode: 'markers',
			       name: 'Editable Upgrade Points',
			       x: editableUpgradePoints.map(p => p.x),
			       y: editableUpgradePoints.map(p => p.y),
			       marker: {
				       size: 10,
				       color: colour_set[4],
				       symbol: 'diamond',
				       line: { width: 2, color: 'rgba(250, 250, 196, 1)' }
			       },
			       hovertemplate:
				       '<b>Editable</b><br>Tech Column: %{x}<br>Gold/Production: %{y:.2f}<extra>Editable Upgrade</extra>'
		       };

		       // --- TOTAL XP LINE ---
		       // Show total XP available from military buildings (Barracks, Armory, Military Academy)
		       const xpPoints: Array<{ gridX: number; xp: number }> = [
			       { gridX: 0, xp: 0 } // Start from grid 0 with 0 XP
		       ];
		       
		       for (const [gridX, xp] of militaryXPByGridX.entries()) {
			       if (gridX <= 16) { // Only include up to gridX 16
				       xpPoints.push({ gridX, xp });
			       }
		       }
		       
		       // Sort by GridX to ensure line connects points in correct order
		       xpPoints.sort((a, b) => a.gridX - b.gridX);
		       
		       const xpLineXs = xpPoints.map(p => p.gridX);
		       const xpLineYs = xpPoints.map(p => p.xp);
		       const maxXp = Math.max(...xpLineYs, 1);
		       
		       const xpLineTrace: Plotly.Data = {
			       type: 'scatter',
			       mode: 'lines+markers',
			       name: 'Total XP Available',
			       x: xpLineXs,
			       y: xpLineYs,
			       yaxis: 'y2', // Use secondary y-axis
			       line: { color: colour_set[6], width: 2, dash: 'dash' },
			       marker: { size: 6, color: colour_set[6] },
			       hovertemplate: 'Tech Column: %{x}<br>Total XP: %{y}<extra>Total XP</extra>',
			       showlegend: true
		       };

		       const layout: Partial<Plotly.Layout> = {
			       title: {
				       text: 'Gold/Production Ratio vs Tech Column',
				       font: { family: 'Tw Cen MT, sans-serif', size: 19, color: 'rgba(250, 250, 196, 1)' }
			       },
			       font: { family: 'Tw Cen MT, sans-serif', color: 'rgba(250, 250, 196, 1)' },
			       paper_bgcolor: '#070b0eff',
			       plot_bgcolor: '#070b0eff',
			       margin: { l: 70, r: 70, t: 80, b: 60 },
			       xaxis: {
				       title: { text: 'Tech Column', font: { size: 16 } },
				       gridcolor: 'rgba(100, 100, 100, 0.3)',
				       zerolinecolor: 'rgba(207, 175, 115, 0.8)',
				       tickfont: { size: 14 },
				       range: [0, 16]
			       },
			       yaxis: {
				       title: { text: 'Gold/Production Ratio', font: { size: 16 } },
				       gridcolor: 'rgba(100, 100, 100, 0.3)',
				       zerolinecolor: 'rgba(207, 175, 115, 0.8)',
				       tickfont: { size: 14 }
			       },
			       yaxis2: {
				       title: { text: 'Total XP', font: { size: 16, color: colour_set[7] } },
				       tickfont: { color: colour_set[7] },
				       overlaying: 'y',
				       side: 'right',
				       range: [0, maxXp * 2]
			       },
			       hovermode: 'closest',
			       legend: {
				       x: 0.73,
				       y: 1,
				       bordercolor: 'rgba(207, 175, 115, 1)',
				       borderwidth: 1,
				       font: { size: 14}
			       },
			       showlegend: true,
			       dragmode: 'pan'
		       };

	       const traces: Plotly.Data[] = [unitLineTrace, buildingLineTrace, upgradeLineTrace, editableUpgradeLineTrace, xpLineTrace];
	       if (showMarkers) {
		       traces.push(unitTrace, buildingTrace, upgradeMarkersTrace, editableUpgradeMarkersTrace);
	       }

	       return {
		       traces,

		       layout
	       };
	}

	/**
	 * Compute gold purchase curve data points for units
	 * Uses actual unit data to map production costs to tech progression.
	 */
	function computeUnitGoldPurchaseCurve(
		maxProduction: number,
		constants: GoldPurchaseConstants = GOLD_PURCHASE_CONSTANTS_VP,
		applyTechScaling: boolean = true
	): { x: number[]; y: number[]; techInfo: string[] } {
		const x: number[] = [];
		const y: number[] = [];
		const techInfo: string[] = [];

		const hurryModifier = getActiveHurryModifier();

		for (let prod = 10; prod <= maxProduction; prod += 5) {
			const techProgress = applyTechScaling 
				? getEstimatedTechProgressFromProductionCorrelation(techProgressData, unitCorrelation, prod)
				: 0;
			const techs = getEstimatedTechsFromProductionCorrelation(techProgressData, unitCorrelation, prod);
			
			const goldCost = getUnitPurchaseCost(prod, gameContext, {
				constants,
				enableVPAdjustments: true,
				techProgress,
				hurryModifier
			});
			x.push(prod);
			y.push(goldCost);
			techInfo.push(`~${techs} techs (${techProgress}%)`);
		}

		return { x, y, techInfo };
	}

	/**
	 * Compute building investment curve data points
	 * Uses building correlation for accurate tech progress mapping.
	 */
	function computeBuildingInvestmentCurve(
		maxProduction: number,
		applyTechScaling: boolean = true
	): { x: number[]; y: number[]; techInfo: string[] } {
		const x: number[] = [];
		const y: number[] = [];
		const techInfo: string[] = [];

		const hurryModifier = getActiveHurryModifier();

		for (let prod = 10; prod <= maxProduction; prod += 5) {
			const techProgress = applyTechScaling 
				? getEstimatedTechProgressFromProductionCorrelation(techProgressData, buildingCorrelation, prod)
				: 0;
			const techs = getEstimatedTechsFromProductionCorrelation(techProgressData, buildingCorrelation, prod);
			
			const goldCost = getBuildingPurchaseCost(prod, gameContext, {
				constants: GOLD_PURCHASE_CONSTANTS_VP,
				enableTechScaling: true,
				isInvestment: true,
				techProgress,
				hurryModifier,
				buildingHurryCostModifier: -20 // Standard buildings get -20%
			});
			x.push(prod);
			y.push(goldCost);
			techInfo.push(`~${techs} techs (${techProgress}%)`);
		}

		return { x, y, techInfo };
	}

	/**
	 * Build Plotly traces and layout for the graph
	 */
	function buildPlotData() {
		// Determine max production from both units and buildings
		const maxUnitProd = Math.max(...meleeUnits.map((u) => u.productionCost), 1500);
		const maxBuildingProd = Math.max(...standardBuildings.map((b) => b.productionCost), 2500);
		const maxProd = Math.max(maxUnitProd, maxBuildingProd);

		// --- UNIT CURVES ---
		const unitCurveData = computeUnitGoldPurchaseCurve(maxProd);
		const unitCurveTrace: Plotly.Data = {
			type: 'scatter',
			mode: 'lines',
			name: 'Unit Purchase (VP)',
			x: unitCurveData.x,
			y: unitCurveData.y,
			line: { color: colour_set[0], width: 2 },
			customdata: unitCurveData.techInfo,
			hovertemplate: 'Production: %{x}<br>Gold: %{y}<br>Tech: %{customdata}<extra>Unit Purchase</extra>'
		};

		// --- BUILDING CURVES ---
		const buildingCurveData = computeBuildingInvestmentCurve(maxProd);
		const buildingCurveTrace: Plotly.Data = {
			type: 'scatter',
			mode: 'lines',
			name: 'Building Investment (VP)',
			x: buildingCurveData.x,
			y: buildingCurveData.y,
			line: { color: colour_set[1], width: 2 },
			customdata: buildingCurveData.techInfo,
			hovertemplate: 'Production: %{x}<br>Gold: %{y}<br>Tech: %{customdata}<extra>Building Investment</extra>'
		};

		// --- UNIT DATA POINTS ---
		const hurryModifier = getActiveHurryModifier();

		const unitTechInfo = meleeUnits.map((u) => {
			const techs = getEstimatedTechsAtGridX(techProgressData, u.techGridX);
			const techPct = getEstimatedTechProgressAtGridX(techProgressData, u.techGridX);
			return `Combat: ${u.combat}<br>${techs} techs (${techPct}%)`;
		});

		const unitPointsTrace: Plotly.Data = {
			type: 'scatter',
			mode: 'text+markers',
			name: 'Melee Units',
			x: meleeUnits.map((u) => u.productionCost),
			y: meleeUnits.map((u) => {
				const techProgress = getEstimatedTechProgressAtGridX(techProgressData, u.techGridX);
				return getUnitPurchaseCost(u.productionCost, gameContext, {
					constants: GOLD_PURCHASE_CONSTANTS_VP,
					enableVPAdjustments: true,
					techProgress,
					hurryModifier
				});
			}),
			text: meleeUnits.map((u) => u.name),
			textposition: 'top left',
			textfont: { size: 12},
			marker: {
				size: 8,
				color: colour_set[0],
				symbol: 'circle',
				line: { width: 1, color: 'rgba(250, 250, 196, 1)' }
			},
			hovertemplate:
				'<b>%{text}</b><br>Production: %{x}<br>Gold: %{y}<br>%{customdata}<extra>Unit</extra>',
			customdata: unitTechInfo
		};

		// --- BUILDING DATA POINTS ---
		const buildingTechInfo = standardBuildings.map((b) => {
			const techs = getEstimatedTechsAtGridX(techProgressData, b.techGridX);
			const techPct = getEstimatedTechProgressAtGridX(techProgressData, b.techGridX);
			return `${techs} techs (${techPct}%)`;
		});

		const buildingPointsTrace: Plotly.Data = {
			type: 'scatter',
			mode: 'text+markers',
			name: 'Buildings (sample)',
			x: standardBuildings.map((b) => b.productionCost),
			y: standardBuildings.map((b) => {
				const techProgress = getEstimatedTechProgressAtGridX(techProgressData, b.techGridX);
				return getBuildingPurchaseCost(b.productionCost, gameContext, {
					constants: GOLD_PURCHASE_CONSTANTS_VP,
					enableTechScaling: true,
					isInvestment: true,
					techProgress,
					hurryModifier,
					buildingHurryCostModifier: -20
				});
			}),
			textposition: 'bottom right',
			marker: {
				size: 8,
				color: colour_set[1],
				symbol: 'circle',
				line: { width: 1, color: 'rgba(250, 250, 196, 1)' }
			},
			hovertemplate:
				'<b>%{text}</b><br>Production: %{x}<br>Gold: %{y}<br>%{customdata}<extra>Building</extra>',
			text: standardBuildings.map((b) => b.name),
			customdata: buildingTechInfo
		};

		const layout: Partial<Plotly.Layout> = {
			title: {
				text: 'Gold Purchase/Investment Cost vs Production Cost',
				font: { family: 'Tw Cen MT, sans-serif', size: 19, color: 'rgba(250, 250, 196, 1)' }
			},
			font: { family: 'Tw Cen MT, sans-serif', color: 'rgba(250, 250, 196, 1)' },
			paper_bgcolor: '#070b0eff',
			plot_bgcolor: '#070b0eff',
			margin: { l: 70, r: 30, t: 80, b: 60 },
			xaxis: {
				title: { text: 'Production Cost', font: { size: 16 } },
				gridcolor: 'rgba(100, 100, 100, 0.3)',
				zerolinecolor: 'rgba(207, 175, 115, 0.8)',
				tickfont: { size: 14 }
			},
			yaxis: {
				title: { text: 'Gold Cost', font: { size: 16 } },
				gridcolor: 'rgba(100, 100, 100, 0.3)',
				zerolinecolor: 'rgba(207, 175, 115, 0.8)',
				tickfont: { size: 14 }
			},
			hovermode: 'closest',
			legend: {
				x: 0.041,
				y: 1,
				bordercolor: 'rgba(207, 175, 115, 1)',
				borderwidth: 1,
				font: { size: 14}
			},
			showlegend: true,
			dragmode: 'pan'
		};

		const traces: Plotly.Data[] = [unitCurveTrace, buildingCurveTrace];
		if (showMarkers) {
			traces.push(unitPointsTrace, buildingPointsTrace);
		}

		return {
			traces,
			layout
		};
	}

	// =============================================================================
	// LIFECYCLE
	// =============================================================================

	const plotlyConfig: Partial<Plotly.Config> = {
		scrollZoom: true,
		displayModeBar: true,
		displaylogo: false,
		responsive: true,
		showEditInChartStudio: false,
		plotlyServerURL: 'https://chart-studio.plotly.com',
		toImageButtonOptions: {
			filename: 'civ5vp_graph',
			format: 'svg'
		},
		modeBarButtonsToRemove: ['lasso2d', 'select2d']
	};

	const throttledUpdate = createThrottle(() => {
		if (!plotDiv || !initialized) return;
		let traces, layout;
		if (graphMode === 'gold-vs-production') {
			({ traces, layout } = buildPlotData());
		} else {
			({ traces, layout } = buildRatioVsGridXPlotData());
		}
		Plotly.react(plotDiv, traces, layout, plotlyConfig);
	}, 16);

	// Update graph when hurry modifiers or display options change
	$effect(() => {
		if (!initialized) return;
		enabledHurryModifiers;
		enableIndustryPolicies;
		industryPolicyCount;
		showMarkers;
		graphMode;
		upgradeCoefficient;
		upgradeConstant;
		throttledUpdate();
	});

	// Initial render
	$effect(() => {
		if (plotDiv && !initialized) {
			initialized = true;
			let traces, layout;
			if (graphMode === 'gold-vs-production') {
				({ traces, layout } = buildPlotData());
			} else {
				({ traces, layout } = buildRatioVsGridXPlotData());
			}
			Plotly.newPlot(plotDiv, traces, layout, plotlyConfig);
		}
	});
</script>

<svelte:head>
	<title>Gold Purchase Cost - VP Mechanics Visualizer</title>
</svelte:head>

<div class="page-container">
	<!-- Left Panel: Controls -->

	<div class="control-panel">
<div class="graph-mode-section">
		<label for="graph-mode-select" class="graph-mode-label">Graph Selection:</label>
		<select id="graph-mode-select" bind:value={graphMode} class="graph-mode-select">
				<option value="gold-vs-production">Gold Cost vs Production</option>
				<option value="ratio-vs-gridx">Gold/Production Ratio vs Tech Column</option>
			</select>
		</div>

		<div class="display-options" style="margin-bottom: 1rem;">
			<h3>Display Options</h3>
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={showMarkers} />
				<span>Show Markers & Labels</span>
			</label>
		</div>

		{#if graphMode === 'ratio-vs-gridx'}
			<div class="upgrade-formula" style="margin-bottom: 1rem;">
				<h3>Upgrade Formula Editor</h3>
				<p class="formula-display">
					Gold = (<span class="coefficient">{upgradeCoefficient.toFixed(2)}</span> × ProdDiff) + <span class="constant">{upgradeConstant}</span>
				</p>
				
				<div class="slider-container">
					<label for="upgrade-coeff-slider">
						Coefficient: <strong>{upgradeCoefficient.toFixed(2)}</strong>
					</label>
					<input
						id="upgrade-coeff-slider"
						type="range"
						min="0.1"
						max="3.0"
						step="0.01"
						bind:value={upgradeCoefficient}
						class="slider"
					/>
					<div class="slider-labels">
						<span>0.1×</span>
						<span>3.0×</span>
					</div>
				</div>

				<div class="slider-container">
					<label for="upgrade-const-slider">
						Constant: <strong>{upgradeConstant}</strong>
					</label>
					<input
						id="upgrade-const-slider"
						type="range"
						min="0"
						max="50"
						step="1"
						bind:value={upgradeConstant}
						class="slider"
					/>
					<div class="slider-labels">
						<span>0</span>
						<span>50</span>
					</div>
				</div>

				<button 
					class="reset-button"
					onclick={() => {
						upgradeCoefficient = 1.0;
						upgradeConstant = 10;
					}}
				>
					Reset to Default (1.0× + 10)
				</button>
			</div>
		{/if}

		<h2>Gold Purchase Costs</h2>

		<div class="info-section">
			<h3>About This Graph</h3>
			<p>
				Compares <strong style="color: #ff6b6b">unit gold purchase</strong> costs vs 
				<strong style="color: #4a9eff">building investment</strong> costs in Vox Populi.
			</p>
			<p>
				Base formula: gold = (prod × 30)^0.68
			</p>

			<h3>Melee Units</h3>
			<ul class="unit-list">
				{#each meleeUnits as unit}
					<li>
						<span class="unit-name">{unit.name}</span>
						<span class="unit-stats"
							>{unit.productionCost}🔨 / {unit.combat}⚔️</span
						>
					</li>
				{/each}
			</ul>
		</div>

		<div class="formula-info">
			<h3>Key Differences</h3>
			<ul>
				<li><strong>Units:</strong> 20% discount, +0.5% per % of techs</li>
				<li><strong>Buildings:</strong> 40% discount, +0.33% per % of techs</li>
			</ul>
			<p style="margin-top: 0.75rem; font-size: 0.85rem;">
				Tech progress is calculated from each item's prerequisite tech GridX position.
			</p>
		</div>

		<div class="tech-info">
			<h3>Tech Progress</h3>
			<p>
				Total technologies: <strong>{techProgressData.totalTechs}</strong>
			</p>
			<p>
				Buildings sampled: <strong>{standardBuildings.length}</strong> (one per GridX)
			</p>
		</div>

		<div class="hurry-modifiers">
			<h3>Hurry Cost Modifiers</h3>
			<p class="modifier-description">
				Active modifiers: <strong style="color: {getActiveHurryModifier() < 0 ? '#64c864' : '#ff6b6b'}">{getActiveHurryModifier()}%</strong>
			</p>

			<div class="modifier-section">
				<h4>Buildings</h4>
				
				<label class="checkbox-label">
					<input
						type="checkbox"
						checked={enabledHurryModifiers.has(FORBIDDEN_PALACE_TYPE)}
						onchange={(e) => {
							if (e.currentTarget.checked) {
								enabledHurryModifiers.add(FORBIDDEN_PALACE_TYPE);
							} else {
								enabledHurryModifiers.delete(FORBIDDEN_PALACE_TYPE);
							}
							enabledHurryModifiers = new Set(enabledHurryModifiers);
						}}
					/>
					<span>Forbidden Palace <span class="modifier-value">(-15%)</span></span>
				</label>

								<label class="checkbox-label">
					<input
						type="checkbox"
						checked={enabledHurryModifiers.has(RIALTO_DISTRICT_TYPE)}
						onchange={(e) => {
							if (e.currentTarget.checked) {
								enabledHurryModifiers.add(RIALTO_DISTRICT_TYPE);
							} else {
								enabledHurryModifiers.delete(RIALTO_DISTRICT_TYPE);
							}
							enabledHurryModifiers = new Set(enabledHurryModifiers);
						}}
					/>
					<span>Rialto District <span class="modifier-value">(-15%)</span></span>
				</label>

				<label class="checkbox-label">
					<input
						type="checkbox"
						checked={enabledHurryModifiers.has(STOCK_EXCHANGE_TYPE)}
						onchange={(e) => {
							if (e.currentTarget.checked) {
								enabledHurryModifiers.add(STOCK_EXCHANGE_TYPE);
							} else {
								enabledHurryModifiers.delete(STOCK_EXCHANGE_TYPE);
							}
							enabledHurryModifiers = new Set(enabledHurryModifiers);
						}}
					/>
					<span>Stock Exchange <span class="modifier-value">(-20%)</span></span>
				</label>
			</div>

			<div class="modifier-section">
				<h4>Industry Policies</h4>
				
				<label class="checkbox-label">
					<input
						type="checkbox"
						bind:checked={enableIndustryPolicies}
					/>
					<span>Enable Industry Branch</span>
				</label>

				{#if enableIndustryPolicies}
					<div class="slider-container">
						<label for="industry-slider">
							Policies Adopted: <strong>{industryPolicyCount}</strong> / 6
							<span class="modifier-value">({industryPolicyCount * -5}%)</span>
						</label>
						<input
							id="industry-slider"
							type="range"
							min="0"
							max="6"
							step="1"
							bind:value={industryPolicyCount}
							class="slider"
						/>
						<div class="slider-labels">
							<span>None</span>
							<span>All</span>
						</div>
					</div>
				{/if}
			</div>

			<p class="modifier-note">
				<em>Note:</em> These modifiers affect both units and buildings. Buildings also have a base -20% modifier (wonders: -5%).
			</p>
		</div>
	</div>

	<!-- Right Panel: Graph -->
	<div class="graph-panel">
		<div class="plot-container" bind:this={plotDiv}></div>
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

	/* Graph Mode Dropdown */
	.graph-mode-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding: 1rem;
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

	.graph-mode-select option {
		background-color: #1a1a2e;
		color: rgba(250, 250, 196, 1);
		padding: 0.5rem;
	}

	/* Left Panel */
	.control-panel {
		width: 320px;
		min-width: 280px;
		padding: 1rem;
		border-right: 1px solid rgba(207, 175, 115, 1);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.control-panel h2 {
		margin: 0;
		padding-bottom: 0.75rem;
		border-bottom: 2px solid #4a9eff;
		font-size: 1.4rem;
		color: rgba(250, 250, 196, 1);
	}

	.info-section {
		background-color: #070b0eff;
		padding: 1rem;
		
		border: 1px solid rgba(207, 175, 115, 1);
	}

	.info-section h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		color: #4a9eff;
	}

	
	.unit-list {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0 0;
	}

	.unit-list li {
		display: flex;
		justify-content: space-between;
		padding: 0.4rem 0;
		border-bottom: 1px solid rgba(100, 100, 150, 0.2);
		font-size: 0.85rem;
	}

	.unit-list li:last-child {
		border-bottom: none;
	}

	.unit-name {
		color: #ff6b6b;
		font-weight: 500;
	}


	.formula-info {
		padding: 1rem;
		border: 1px solid rgba(207, 175, 115, 1);
	}

	.formula-info h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		color: #4a9eff;
	}

	.formula-info ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.formula-info li {
		padding: 0.3rem 0;
		font-size: 0.85rem;
		color: rgba(250, 250, 196, 1);
	}

	.formula-info strong {
		color: rgba(250, 250, 196, 1);
	}

	.tech-info {
		padding: 1rem;
		border: 1px solid rgba(207, 175, 115, 1);
	}

	.tech-info h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		color: #64c864;
	}

	.tech-info p {
		margin: 0 0 0.5rem 0;
		font-size: 0.85rem;
		line-height: 1.5;
		color: rgba(250, 250, 196, 1);
	}

	.tech-info strong {
		color: #64c864;
	}

	.hurry-modifiers {
		padding: 1rem;
		border: 1px solid rgba(207, 175, 115, 1);
	}

	.hurry-modifiers h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		color: #ffc864;
	}

	.hurry-modifiers h4 {
		margin: 1rem 0 0.5rem 0;
		font-size: 0.9rem;
		color: rgba(250, 250, 196, 1);
		font-weight: 600;
	}

	.modifier-description {
		margin: 0 0 1rem 0;
		font-size: 0.85rem;
		color: rgba(250, 250, 196, 1);
	}

	.modifier-section {
		margin-bottom: 1rem;
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

	.checkbox-label:hover {
		color: rgba(250, 250, 196, 1);
	}

	.modifier-value {
		color: #64c864;
		font-weight: 600;
		font-family: 'Consolas', monospace;
	}

	.slider-container {
		margin-top: 0.75rem;
		padding: 0.75rem;
		background-color: rgba(255, 200, 100, 0.05);
	}

	.slider-container label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
		color: rgba(250, 250, 196, 1);
	}

	.slider {
		width: 100%;
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(to right, #2a2a4a, #ffc864);
		outline: none;
		-webkit-appearance: none;
		appearance: none;
	}

	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #ffc864;
		cursor: pointer;
		box-shadow: 0 0 4px rgba(255, 200, 100, 0.5);
	}

	.slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #ffc864;
		cursor: pointer;
		border: none;
		box-shadow: 0 0 4px rgba(255, 200, 100, 0.5);
	}

	.slider-labels {
		display: flex;
		justify-content: space-between;
		margin-top: 0.25rem;
		font-size: 0.75rem;
		color: rgba(250, 250, 196, 1);
	}

	.modifier-note {
		margin: 1rem 0 0 0;
		padding: 0.75rem;
		background-color: rgba(100, 100, 150, 0.1);
		border-left: 3px solid #ffc864;
		font-size: 0.8rem;
		line-height: 1.4;
		color: rgba(250, 250, 196, 1);
	}

	.modifier-note em {
		color: #ffc864;
		font-style: normal;
		font-weight: 600;
	}

	.upgrade-formula {
		padding: 1rem;
		border: 1px solid rgba(207, 175, 115, 1);
	}

	.upgrade-formula h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		color: #e6cd1a;
	}

	.formula-display {
		background-color: rgba(230, 205, 26, 0.1);
		padding: 0.75rem;
		border-left: 3px solid #e6cd1a;
		font-family: 'Consolas', monospace;
		font-size: 0.9rem;
		margin-bottom: 1rem;
		color: rgba(250, 250, 196, 1);
	}

	.formula-display .coefficient {
		color: #ff90ff;
		font-weight: 700;
	}

	.formula-display .constant {
		color: #64c8ff;
		font-weight: 700;
	}

	.reset-button {
		width: 100%;
		padding: 0.5rem;
		margin-top: 0.5rem;
		background-color: rgba(230, 205, 26, 0.2);
		border: 1px solid #e6cd1a;
		color: rgba(250, 250, 196, 1);
		font-family: 'Tw Cen MT', sans-serif;
		font-size: 0.85rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.reset-button:hover {
		background-color: rgba(230, 205, 26, 0.3);
	}

	/* Right Panel */
	.graph-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.plot-container {
		flex: 1;
		width: 100%;
		height: 100%;
		background: #070b0eff;
	}

	/* Plotly overrides */
	:global(.plot-container .plotly) {
		height: 100% !important;
		background: #070b0eff;
	}

	:global(.plot-container .main-svg) {
		background: transparent !important;
	}
</style>
