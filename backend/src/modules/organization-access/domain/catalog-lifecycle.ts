export const catalogDefinitions = {
  branches: { table: 'branches', resourceType: 'ORGANIZATION_BRANCH' },
  departments: { table: 'departments', resourceType: 'ORGANIZATION_DEPARTMENT' },
  positions: { table: 'positions', resourceType: 'ORGANIZATION_POSITION' },
  teams: { table: 'organization_teams', resourceType: 'ORGANIZATION_TEAM' },
} as const;
export type CatalogKind = keyof typeof catalogDefinitions;

export function isCatalogKind(value: string): value is CatalogKind {
  return Object.hasOwn(catalogDefinitions, value);
}

export function canDeleteCatalog(everUsed: boolean, referenceCount: number): boolean {
  return !everUsed && referenceCount === 0;
}
