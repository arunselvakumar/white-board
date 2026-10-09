import type { PlanGrant } from "@/src/shared-kernel/plan";

/** Screen words for what a plan counts. */
export const GRANT_LABELS: Record<PlanGrant, string> = {
  project: "Projects",
  team_member: "Team Members",
  hrms_member: "HRMS Team Members",
  storage_gb: "Storage (GB)",
};

export const STATUS_LABELS = {
  active: "Active",
  expired: "Ended",
} as const;

export const KIND_LABELS = {
  new: "New plan",
  extend: "Extension",
  upgrade: "Upgrade",
  add_ons: "Add-ons",
} as const;

export const longDate = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "long",
  timeZone: "Asia/Kolkata",
});

export function daysLeftText(days: number): string {
  return `${String(days)} ${days === 1 ? "day" : "days"} left`;
}
