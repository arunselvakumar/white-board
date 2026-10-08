/** A new Company's free trial (CM-104; plans and limits: CM-116). */
export const TRIAL_DAYS = 14;
/** The plan whose limits a trial uses. */
export const TRIAL_PLAN_CODE = "basic";

export function trialEndsAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}
