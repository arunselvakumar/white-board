import { DomainError } from "@/src/shared-kernel/domain-error";

import { haversineMetres, isLatitude, isLongitude, type GeoPoint } from "./geo";

/**
 * Branches and geo-fences (CM-304, `modules/10` "Branches & Project
 * Sites"). A fence is a point and a radius in metres. An **office branch**
 * is a named Company office; a **project site** fence belongs to one
 * Project (one fence per Project) and carries a site label. Which fences
 * apply to a member is `fencesForMember` below (ADR CM-0012 §4).
 */

export const BRANCH_KINDS = ["office_branch", "project_site"] as const;

export type BranchKind = (typeof BRANCH_KINDS)[number];

export const BRANCH_LIMITS = {
  maxNameLength: 80,
  maxAddressLength: 300,
  minRadiusMetres: 25,
  maxRadiusMetres: 5000,
  /** Coordinates are kept to 6 decimals (about 0.1 m). */
  coordinateDecimals: 6,
} as const;

/**
 * The most GPS uncertainty that counts in the member's favour at check-in.
 * A phone that says "within 30 m" 20 m outside the fence is let in; one that
 * says "within 2 km" gets no more than this.
 */
export const MAX_ACCURACY_ALLOWANCE_METRES = 50;

/** A fence as check-in reads it (`my-fences`). */
export type Fence = Readonly<{
  id: string;
  kind: BranchKind;
  /** Branch name, or the site label of a project site. */
  name: string;
  /** Set exactly for a project site. */
  projectId: string | null;
  latitude: number;
  longitude: number;
  radiusMetres: number;
}>;

export type BranchDetails = Readonly<{
  kind: BranchKind;
  name: string;
  address: string | null;
  projectId: string | null;
  latitude: number;
  longitude: number;
  radiusMetres: number;
}>;

export type BranchInput = {
  kind: string;
  name: string;
  address?: string | null;
  projectId?: string | null;
  latitude: number;
  longitude: number;
  radiusMetres: number;
};

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

function isBranchKind(value: string): value is BranchKind {
  return (BRANCH_KINDS as readonly string[]).includes(value);
}

/** Rounds to 6 decimals, the column's scale. */
export function roundCoordinate(value: number): number {
  const factor = 10 ** BRANCH_LIMITS.coordinateDecimals;
  return Math.round(value * factor) / factor;
}

/**
 * Validates and normalises a branch or a project-site fence. Throws a
 * `DomainError` whose `details.field` names the field at fault.
 */
export function createBranch(input: BranchInput): BranchDetails {
  if (!isBranchKind(input.kind))
    throw invalid(
      "BRANCH_KIND_INVALID",
      "Choose an office branch or a Project site.",
      "kind",
    );
  const site = input.kind === "project_site";
  const name = input.name.trim();
  if (name === "")
    throw invalid(
      "BRANCH_NAME_REQUIRED",
      site ? "Enter a site label." : "Enter the branch name.",
      "name",
    );
  if (name.length > BRANCH_LIMITS.maxNameLength)
    throw invalid(
      "BRANCH_NAME_TOO_LONG",
      `Use at most ${String(BRANCH_LIMITS.maxNameLength)} characters.`,
      "name",
    );
  const address = input.address?.trim() ?? "";
  if (address.length > BRANCH_LIMITS.maxAddressLength)
    throw invalid(
      "BRANCH_ADDRESS_TOO_LONG",
      `Use at most ${String(BRANCH_LIMITS.maxAddressLength)} characters.`,
      "address",
    );
  const projectId = input.projectId?.trim() ?? "";
  if (site && projectId === "")
    throw invalid(
      "BRANCH_PROJECT_REQUIRED",
      "Choose the Project this site fence belongs to.",
      "projectId",
    );
  if (!isLatitude(input.latitude))
    throw invalid(
      "BRANCH_LATITUDE_INVALID",
      "Latitude is a number from -90 to 90.",
      "latitude",
    );
  if (!isLongitude(input.longitude))
    throw invalid(
      "BRANCH_LONGITUDE_INVALID",
      "Longitude is a number from -180 to 180.",
      "longitude",
    );
  const { minRadiusMetres, maxRadiusMetres } = BRANCH_LIMITS;
  if (
    !Number.isInteger(input.radiusMetres) ||
    input.radiusMetres < minRadiusMetres ||
    input.radiusMetres > maxRadiusMetres
  )
    throw invalid(
      "BRANCH_RADIUS_INVALID",
      `The fence radius is ${String(minRadiusMetres)} to ${maxRadiusMetres.toLocaleString("en-IN")} whole metres.`,
      "radiusMetres",
    );
  return Object.freeze({
    kind: input.kind,
    name,
    address: address === "" ? null : address,
    projectId: site ? projectId : null,
    latitude: roundCoordinate(input.latitude),
    longitude: roundCoordinate(input.longitude),
    radiusMetres: input.radiusMetres,
  });
}

/** Metres from the point to the fence's centre (haversine). */
export function distanceToFence(fence: Fence, point: GeoPoint): number {
  return haversineMetres(
    { latitude: fence.latitude, longitude: fence.longitude },
    point,
  );
}

/** The GPS accuracy that counts, metres: 0 when unknown or nonsense. */
function allowance(accuracyMetres: number | null | undefined): number {
  if (
    accuracyMetres == null ||
    !Number.isFinite(accuracyMetres) ||
    accuracyMetres < 0
  )
    return 0;
  return Math.min(accuracyMetres, MAX_ACCURACY_ALLOWANCE_METRES);
}

/**
 * Whether a device location is inside one fence: its distance from the
 * centre is at most the radius plus the device's reported accuracy, capped
 * at `MAX_ACCURACY_ALLOWANCE_METRES`. The boundary itself counts as inside.
 */
export function isInside(
  fence: Fence,
  point: GeoPoint,
  accuracyMetres?: number | null,
): boolean {
  return (
    distanceToFence(fence, point) <=
    fence.radiusMetres + allowance(accuracyMetres)
  );
}

export type FenceMatch = { fence: Fence; distanceMetres: number };

/**
 * The fence a check-in falls in (CM-308 stores its id as the check-in's
 * branch): of the fences the point is inside (`isInside`), the one whose
 * centre is nearest. Null when outside every fence or there are none.
 */
export function matchFence(
  fences: readonly Fence[],
  point: GeoPoint,
  accuracyMetres?: number | null,
): FenceMatch | null {
  let best: FenceMatch | null = null;
  for (const fence of fences) {
    if (!isInside(fence, point, accuracyMetres)) continue;
    const distanceMetres = distanceToFence(fence, point);
    if (best == null || distanceMetres < best.distanceMetres)
      best = { fence, distanceMetres };
  }
  return best;
}

/**
 * Whether a device location is inside any of `fences` (the member's
 * `my-fences`); false when there are none. CM-308 refuses a `required`
 * check-in with `OUTSIDE_FENCE` when this is false, and with
 * `OFFICE_LOCATION_NOT_CONFIGURED` when `fences` is empty.
 */
export function isInsideAnyFence(
  fences: readonly Fence[],
  point: GeoPoint,
  accuracyMetres?: number | null,
): boolean {
  return matchFence(fences, point, accuracyMetres) != null;
}

/** What `fencesForMember` needs to know about the member. */
export type FenceMember = {
  memberType: "normal" | "hrms";
  /** Office branches the member is linked to ("Members who check in here"). */
  linkedBranchIds: readonly string[];
  /** Projects the member is assigned to; empty for HRMS Team Members. */
  projectIds: readonly string[];
};

/**
 * The fences that apply to a member (ADR CM-0012 §4): the office branches
 * they are linked to, or every office branch when linked to none; plus,
 * for a Normal Team Member, the site fences of their Projects. HRMS Team
 * Members have no Projects, so they only use office branches. Office
 * branches first, then sites, each by name.
 */
export function fencesForMember(
  member: FenceMember,
  fences: readonly Fence[],
): Fence[] {
  const linked = new Set(member.linkedBranchIds);
  const offices = fences.filter((fence) => fence.kind === "office_branch");
  const linkedOffices = offices.filter((fence) => linked.has(fence.id));
  const projects = new Set(
    member.memberType === "hrms" ? [] : member.projectIds,
  );
  const sites = fences.filter(
    (fence) =>
      fence.kind === "project_site" &&
      fence.projectId != null &&
      projects.has(fence.projectId),
  );
  const byName = (a: Fence, b: Fence) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  return [
    ...(linkedOffices.length > 0 ? linkedOffices : offices).sort(byName),
    ...sites.sort(byName),
  ];
}
