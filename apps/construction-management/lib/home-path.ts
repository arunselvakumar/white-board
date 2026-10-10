import { HRMS_PATH } from "./hrms-nav";
import { APP_HOME } from "./safe-redirect";

/**
 * Where a signed-in Team Member lands (CM-318): an HRMS Team Member works
 * only in HRMS and has no Projects, so they land on Workspace → HRMS;
 * everyone else on the Projects home.
 */
export function homePathFor(memberType: "normal" | "hrms" | null): string {
  return memberType === "hrms" ? HRMS_PATH : APP_HOME;
}
