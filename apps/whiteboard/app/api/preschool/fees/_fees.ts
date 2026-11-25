import { createFeeHandlers } from "@/src/preschool/infrastructure/create-fee-handlers";

import { requirePreschoolActor } from "../_lib/session";

/** One set of fee handlers for every fees route. */
export const fees = createFeeHandlers();

/** Owner, Centre Head or Parent: a Child's fee account and Receipts. */
export function requireFeeReader() {
  return requirePreschoolActor(["owner", "centre_head", "parent"]);
}

export type ChildIdContext = { params: Promise<{ childId: string }> };

export function searchParams(request: Request, names: readonly string[]) {
  const url = new URL(request.url);
  return Object.fromEntries(
    names.map((name) => [name, url.searchParams.get(name) ?? undefined]),
  );
}
