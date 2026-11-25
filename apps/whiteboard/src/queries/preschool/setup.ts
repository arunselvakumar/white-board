import type { SetUpPreschoolResult } from "@/src/preschool/application/set-up-preschool";

import { apiJson } from "../http";

/** Finishes setting up a Preschool Workspace (Owner). Safe to call again. */
export function setUpPreschool(): Promise<SetUpPreschoolResult> {
  return apiJson<SetUpPreschoolResult>("/api/preschool/setup", {
    method: "POST",
  });
}
