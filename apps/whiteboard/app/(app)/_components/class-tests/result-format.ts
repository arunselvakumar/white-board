// Shared wording for Test results on staff and family screens (ADR-0038).

import {
  formatMarks,
  type TestResultStatus,
  type TestResultValueView,
} from "@/src/queries/class-tests";

export const RESULT_STATUS_LABEL: Record<TestResultStatus, string> = {
  scored: "Scored",
  absent: "Absent",
  exempt: "Exempt",
};

/** "34 / 50", "Absent", or "Exempt". */
export function resultText(
  result: Pick<TestResultValueView, "status" | "marks">,
  maxMarks: number,
): string {
  if (result.status === "scored" && result.marks != null)
    return `${formatMarks(result.marks)} / ${String(maxMarks)}`;
  return RESULT_STATUS_LABEL[result.status];
}

/** "Pass", "Fail", or null when there is no pass mark or no score. */
export function passText(passed: boolean | null): "Pass" | "Fail" | null {
  if (passed == null) return null;
  return passed ? "Pass" : "Fail";
}

/** The guidance staff see while entering marks on a draft. */
export const DRAFT_VISIBILITY_NOTE =
  "Students and Parents can't see these marks until you publish.";

/** What publishing does, shown in the confirmation. */
export const PUBLISH_CONFIRMATION =
  "Results, including remarks, will become visible to the Students on this Test and their Parents.";

/** Shown on a published Test. */
export const PUBLISHED_EDIT_NOTE =
  "Published. Students and Parents can see these results, and any change you save will be visible to them.";
