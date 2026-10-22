/** Credits a project can list. Labels live in src/i18n/ui.ts as `role.<id>`. */
export const ROLES = [
  'director',
  'co-director',
  'writer',
  'editor',
  'camera',
  'idea',
  'styling',
  'music',
  'creator',
  'photography',
] as const;
export type Role = (typeof ROLES)[number];

/** Role filter on the cinematography list: each button matches one or more credits. */
export const ROLE_FILTERS = {
  director: ['director', 'co-director'],
  writer: ['writer'],
  editor: ['editor'],
  camera: ['camera'],
} as const satisfies Record<string, readonly Role[]>;
export type RoleFilter = keyof typeof ROLE_FILTERS;

/** Filter keys a project matches, e.g. ['director', 'editor'] for co-director + editor. */
export const filtersFor = (roles: readonly Role[]): RoleFilter[] =>
  (Object.keys(ROLE_FILTERS) as RoleFilter[]).filter((key) =>
    (ROLE_FILTERS[key] as readonly Role[]).some((role) => roles.includes(role)),
  );
