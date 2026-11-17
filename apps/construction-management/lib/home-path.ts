import { HRMS_PATH } from "./hrms-nav";
import type { AppHref } from "./page-href";
import { APP_HOME } from "./safe-redirect";

/**
 * Where a signed-in Team Member lands (CM-318): an HRMS Team Member works
 * only in HRMS and has no Projects, so they land on Human Resources → HRMS;
 * everyone else on the Projects home.
 */
export function homePathFor(memberType: "normal" | "hrms" | null): AppHref {
  return memberType === "hrms" ? HRMS_PATH : APP_HOME;
}
