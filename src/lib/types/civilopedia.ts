/**
 * TypeScript interfaces for civilopedia_export.json entities
 * These types mirror the structure of the Vox Populi game database
 */

// =============================================================================
// COMMON TYPES
// =============================================================================

/** Reference to another entity by Type and Name */
export interface EntityReference {
	Type: string;
	Name: string;
}

/** Technology reference with Type and Name */
export interface TechReference {
	Type: string;
	Name: string;
}

/** Yield change entry (for buildings, improvements, etc.) */
export interface YieldChange {
	YieldType: string;
	Yield: number;
	YieldName: string;
}

/** Civilization reference for unique units/buildings */
export interface CivilizationReference {
	Type: string;
	Name: string;
	Adjective: string;
}

// =============================================================================
// PROMOTIONS
// =============================================================================

export interface Promotion {
	Type: string;
	Name: string;
	ID: number;
	PediaType?: string;
	PediaTypeLabel?: string;
	CannotBeChosen: boolean;
	RequiredPromotions?: EntityReference[];
	LeadsToPromotions?: EntityReference[];
	Sound?: string;
	IconAtlas: string;
	PortraitIndex: number;
	Help: string;
}

// =============================================================================
// UNITS
// =============================================================================

export interface Unit {
	Type: string;
	Name: string;
	ID: number;

	// Era info
	EraName: string;
	EraID: number;

	// Combat stats
	Combat: number;
	RangedCombat?: number;
	Range?: number;
	Moves: number;

	// Classification
	Domain: 'DOMAIN_LAND' | 'DOMAIN_SEA' | 'DOMAIN_AIR';
	Class: string;

	// Cost is embedded in Help text, not a direct field
	// Use parseCostFromHelp() utility to extract

	// Tech requirements
	PrereqTech?: TechReference;
	ObsoleteTech?: TechReference;

	// Promotions and abilities
	FreePromotions: EntityReference[] | Record<string, never>;

	// Unique unit info (array, not single object)
	Replaces: Array<EntityReference & { ID: number; IsGreatPerson: boolean }> | Record<string, never>;
	Civilizations?: CivilizationReference[];

	// Visual
	IconAtlas: string;
	PortraitIndex: number;

	// Text
	Strategy?: string;
	Help: string;
	Civilopedia: string;
}

// =============================================================================
// BUILDINGS
// =============================================================================

export interface Building {
	Type: string;
	Name: string;
	ID: number;
	BuildingClass: string;

	// Era info
	EraName: string;
	EraID: number;

	// Costs
	Cost: number;
	Maintenance: number;
	FaithCost: number;

	// Tech requirements
	PrereqTech?: TechReference;

	// Building chain
	RequiredBuildings: EntityReference[] | Record<string, never>;
	LeadsToBuildings: Array<EntityReference & { IsWonder: boolean }> | Record<string, never>;

	// Yields
	YieldChanges: YieldChange[] | Record<string, never>;
	YieldModifiers: Record<string, number> | Record<string, never>;

	// Specialists
	SpecialistCount: number;
	GreatPeopleRateChange: number;

	// Classification flags
	IsWonder: boolean;
	IsNationalWonder: boolean;
	IsCorporation: boolean;
	UnlockedByBelief: boolean;

	// Unique building info
	Civilizations?: CivilizationReference[];

	// Visual
	IconAtlas: string;
	PortraitIndex: number;

	// Text
	Strategy?: string;
	Help: string;
	Civilopedia: string;
}

// =============================================================================
// TECHNOLOGIES
// =============================================================================

export interface WorkerAction {
	Type: string;
	Name: string;
	IconAtlas: string;
	IconIndex: number;
	CreatesImprovement?: {
		Type: string;
		Name: string;
	};
}

export interface Technology {
	Type: string;
	Name: string;
	ID: number;

	// Era info
	Era: string;
	EraID: number;
	EraName: string;

	// Cost
	Cost: number;

	// Tech tree position
	GridX: number;
	GridY: number;

	// Connections
	LeadsToTechs: TechReference[];

	// Unlocks
	UnlockedUnits: EntityReference[] | Record<string, never>;
	UnlockedBuildings: EntityReference[] | Record<string, never>;
	UnlockedWonders: EntityReference[] | Record<string, never>;
	UnlockedProjects: EntityReference[] | Record<string, never>;
	RevealedResources: EntityReference[];
	WorkerActions: WorkerAction[] | Record<string, never>;

	// Visual
	IconAtlas: string;
	PortraitIndex: number;

	// Text
	Help: string;
	Civilopedia: string;
	Quote: string;
}

// =============================================================================
// WONDERS
// =============================================================================

export interface Wonder {
	Type: string;
	Name: string;
	ID: number;
	BuildingClass: string;

	// Era info
	EraName: string;
	EraID: number;

	// Costs
	Cost: number;
	FaithCost: number;

	// Tech requirements
	PrereqTech?: TechReference;

	// Yields
	YieldChanges: YieldChange[] | Record<string, never>;
	YieldModifiers: Record<string, number> | Record<string, never>;

	// Great works
	GreatWorkSlotType?: string;
	GreatWorkCount?: number;

	// Classification
	IsWonder: boolean;
	IsNationalWonder: boolean;

	// Visual
	IconAtlas: string;
	PortraitIndex: number;

	// Text
	Strategy?: string;
	Help: string;
	Civilopedia: string;
	Quote?: string;
}

// =============================================================================
// BELIEFS
// =============================================================================

export interface Belief {
	Type: string;
	Name: string;
	ID: number;
	BeliefClass: string;

	// Text
	Help: string;
	Civilopedia?: string;
}

// =============================================================================
// POLICIES
// =============================================================================

export interface Policy {
	Type: string;
	Name: string;
	ID: number;

	// Branch info
	PolicyBranchType?: string;
	Level?: number;

	// Requirements
	PrereqPolicies?: EntityReference[];

	// Visual
	IconAtlas: string;
	PortraitIndex: number;

	// Text
	Help: string;
	Civilopedia: string;
}

// =============================================================================
// RESOURCES
// =============================================================================

export interface Resource {
	Type: string;
	Name: string;
	ID: number;

	// Classification
	ResourceClass: 'RESOURCECLASS_BONUS' | 'RESOURCECLASS_LUXURY' | 'RESOURCECLASS_STRATEGIC';
	ResourceUsage?: number;

	// Yields
	YieldChanges?: YieldChange[];

	// Visual
	IconAtlas: string;
	PortraitIndex: number;

	// Text
	Help?: string;
	Civilopedia: string;
}

// =============================================================================
// CIVILIZATIONS
// =============================================================================

export interface Leader {
	Type: string;
	Name: string;
	ID: number;
	CivilizationType: string;

	// Visual
	IconAtlas: string;
	PortraitIndex: number;

	// Text
	Civilopedia: string;
}

export interface Civilization {
	Type: string;
	Name: string;
	ID: number;
	Adjective: string;

	// Unique items
	UniqueUnits?: EntityReference[];
	UniqueBuildings?: EntityReference[];

	// Visual
	IconAtlas: string;
	PortraitIndex: number;

	// Text
	Civilopedia: string;
}

// =============================================================================
// IMPROVEMENTS
// =============================================================================

export interface Improvement {
	Type: string;
	Name: string;
	ID: number;

	// Requirements
	PrereqTech?: TechReference;

	// Yields
	YieldChanges?: YieldChange[];

	// Visual
	IconAtlas: string;
	PortraitIndex: number;

	// Text
	Help?: string;
	Civilopedia: string;
}

// =============================================================================
// FULL DATABASE TYPE
// =============================================================================

export interface CivilopediaData {
	promotions: Promotion[];
	concepts: unknown[];
	leaders: Leader[];
	beliefs: Belief[];
	civilizations: Civilization[];
	buildings: Building[];
	resources: Resource[];
	policies: Policy[];
	wonders: Wonder[];
	improvements: Improvement[];
	terrain: unknown[];
	corporations: unknown[];
	metadata: {
		exportDate: string;
		version: string;
	};
	leagueProjects: unknown[];
	resolutions: unknown[];
	cityStates: unknown[];
	technologies: Technology[];
	greatPeople: unknown[];
	religions: unknown[];
	units: Unit[];
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/** Extract entities by era */
export type EntitiesByEra<T extends { EraID: number }> = Map<number, T[]>;

/** Era name mapping */
export const ERA_NAMES: Record<number, string> = {
	0: 'Ancient',
	1: 'Classical',
	2: 'Medieval',
	3: 'Renaissance',
	4: 'Industrial',
	5: 'Modern',
	6: 'Atomic',
	7: 'Information'
} as const;

/** Domain display names */
export const DOMAIN_NAMES: Record<string, string> = {
	DOMAIN_LAND: 'Land',
	DOMAIN_SEA: 'Naval',
	DOMAIN_AIR: 'Air'
} as const;
