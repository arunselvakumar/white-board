import { describe, expect, it } from "vitest";

import {
  assertKnownProjects,
  type ProjectDirectory,
} from "./project-directory";

const directory: ProjectDirectory = {
  unknownIds: (_workspaceId, ids) =>
    Promise.resolve(ids.filter((id) => id !== "known")),
};

describe("assertKnownProjects", () => {
  it("passes when every id is a live Project, or there are none", async () => {
    await expect(
      assertKnownProjects(directory, "company-1", ["known"]),
    ).resolves.toBeUndefined();
    await expect(
      assertKnownProjects(directory, "company-1", []),
    ).resolves.toBeUndefined();
    await expect(
      assertKnownProjects(directory, "company-1", undefined),
    ).resolves.toBeUndefined();
  });

  it("is 400 PROJECT_NOT_FOUND naming the unknown ids", async () => {
    await expect(
      assertKnownProjects(directory, "company-1", ["known", "gone"]),
    ).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
      kind: "invalid",
      details: { projectIds: ["gone"] },
    });
  });
});
