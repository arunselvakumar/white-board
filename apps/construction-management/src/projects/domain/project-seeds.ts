/**
 * Rows every new Project starts with (ADR CM-0013 §8–9). The migration
 * `20261010180000_construction_projects_structure` gave the same rows to
 * Projects created before M4; keep the two in step.
 */
export const SEED_DRAWING_ALBUMS = [
  "Architect",
  "Electrical",
  "Plumbing",
  "Structural Drawing",
] as const;

export const SEED_TESTING_ITEMS = [
  "Rcc cube",
  "Steel",
  "Cement",
  "Bricks",
] as const;
