import { describe, expect, it } from "vitest";

import type { Designation } from "../domain/designation";
import type { DesignationRepository } from "../domain/designation-repository";
import { DesignationHandlers } from "./designation-handlers";

class MemoryDesignations implements DesignationRepository {
  readonly rows = new Map<string, Designation>();

  save(designation: Designation): Promise<void> {
    this.rows.set(designation.id, designation);
    return Promise.resolve();
  }

  findById(workspaceId: string, id: string): Promise<Designation | null> {
    const found = this.rows.get(id);
    return Promise.resolve(
      found?.workspaceId === workspaceId && found.deletedAt == null
        ? found
        : null,
    );
  }

  listAll(workspaceId: string): Promise<Designation[]> {
    return Promise.resolve(
      [...this.rows.values()].filter(
        (item) => item.workspaceId === workspaceId && item.deletedAt == null,
      ),
    );
  }
}

const NOW = new Date("2026-10-08T00:00:00Z");

describe("DesignationHandlers.delete", () => {
  it("refuses while a Team Member holds the Designation", async () => {
    const held = new Set<string>();
    const handlers = new DesignationHandlers(
      new MemoryDesignations(),
      () => NOW,
      (_workspaceId, id) => Promise.resolve(held.has(id)),
    );
    const created = await handlers.create({
      workspaceId: "company-1",
      name: "Surveyor",
      by: "user-1",
    });
    held.add(created.id);
    await expect(
      handlers.delete({ workspaceId: "company-1", id: created.id, by: "u" }),
    ).rejects.toMatchObject({ code: "DESIGNATION_IN_USE", kind: "conflict" });

    held.clear();
    await handlers.delete({
      workspaceId: "company-1",
      id: created.id,
      by: "u",
    });
    await expect(handlers.list("company-1")).resolves.toEqual([]);
  });

  it("deletes without a usage check when none is given", async () => {
    const handlers = new DesignationHandlers(
      new MemoryDesignations(),
      () => NOW,
    );
    const created = await handlers.create({
      workspaceId: "company-1",
      name: "Surveyor",
      by: "user-1",
    });
    await handlers.delete({
      workspaceId: "company-1",
      id: created.id,
      by: "u",
    });
    await expect(handlers.get("company-1", created.id)).rejects.toMatchObject({
      code: "DESIGNATION_NOT_FOUND",
    });
  });
});
