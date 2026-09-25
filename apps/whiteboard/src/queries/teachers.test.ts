import { describe, expect, it } from "vitest";

import { myBatchQueries, teacherQueries } from "./teachers";

describe("Teacher cache isolation", () => {
  it("uses Workspace and User identity in Teacher query keys", () => {
    expect(teacherQueries.list("org_one").queryKey).not.toEqual(teacherQueries.list("org_two").queryKey);
    expect(teacherQueries.detail("org_one", "teacher_one").queryKey).not.toEqual(teacherQueries.detail("org_two", "teacher_one").queryKey);
    expect(teacherQueries.batchOptions("org_one").queryKey).not.toEqual(teacherQueries.batchOptions("org_two").queryKey);
    expect(myBatchQueries.list("org_one", "user_one").queryKey).not.toEqual(myBatchQueries.list("org_two", "user_one").queryKey);
    expect(myBatchQueries.list("org_one", "user_one").queryKey).not.toEqual(myBatchQueries.list("org_one", "user_two").queryKey);
    expect(myBatchQueries.activation("org_one", "user_one").queryKey).not.toEqual(myBatchQueries.activation("org_two", "user_one").queryKey);
  });
});
