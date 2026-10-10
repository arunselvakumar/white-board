/**
 * Amenities and Common Developments every Company starts with (ADR CM-0013
 * §5). The migration `20261010180200_construction_masters_development_seeds`
 * gave the same rows to Companies created before M4; keep the two in step.
 */
export const SEED_AMENITIES = [
  "Swimming Pool",
  "Club House",
  "Gymnasium",
  "Children's Play Area",
  "Landscaped Garden",
  "Jogging Track",
  "Indoor Games Room",
  "Multipurpose Hall",
] as const;

export const SEED_COMMON_DEVELOPMENTS = [
  "Compound Wall",
  "Internal Roads",
  "Main Gate & Security Cabin",
  "Overhead Water Tank",
  "Underground Sump",
  "Sewage Treatment Plant",
  "Storm Water Drain",
  "Rain Water Harvesting",
  "Street Lights",
  "Electrical Substation",
] as const;
