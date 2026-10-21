import { describe, expect, it, vi } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { lockPickedLists } from "./picked-lists";
import type { SalesTx } from "./ports";
import type {
  SalesListStore,
  StoredSalesListItem,
} from "./sales-settings-handlers";

const PROJECT = "p";
const tx = {} as SalesTx;

function item(
  id: string,
  change: Partial<StoredSalesListItem> = {},
): StoredSalesListItem {
  return {
    id,
    workspaceId: "ws",
    projectId: PROJECT,
    name: id,
    isSeed: false,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...change,
  };
}

/** A store whose `share` returns the rows as they read after the lock. */
function lists(rows: StoredSalesListItem[]) {
  const share = vi.fn(
    (_db: SalesTx, _ws: string, _kind: string, ids: readonly string[]) =>
      Promise.resolve(
        new Map(
          rows
            .filter((row) => ids.includes(row.id))
            .map((row) => [row.id, row]),
        ),
      ),
  );
  return { store: { share } as unknown as SalesListStore, share };
}

async function code(run: Promise<unknown>): Promise<string | null> {
  try {
    await run;
    return null;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe("lockPickedLists (review of #93)", () => {
  it("locks the picked stage and Lead Source and lets live ones through", async () => {
    const { store, share } = lists([item("stage"), item("source")]);
    await lockPickedLists(store, tx, "ws", PROJECT, {
      funnelStageId: "stage",
      leadSourceId: "source",
      stageField: "funnelStageId",
    });
    expect(share).toHaveBeenCalledWith(tx, "ws", "lead_source", ["source"]);
    expect(share).toHaveBeenCalledWith(tx, "ws", "funnel_stage", ["stage"]);
  });

  it("refuses a stage deleted after the first check", async () => {
    const { store } = lists([item("stage", { deletedAt: new Date() })]);
    const run = lockPickedLists(store, tx, "ws", PROJECT, {
      funnelStageId: "stage",
      leadSourceId: null,
      stageField: "toStageId",
    });
    await expect(run).rejects.toMatchObject({
      code: "FUNNEL_STAGE_NOT_FOUND",
      details: { field: "toStageId" },
    });
  });

  it("refuses a Lead Source deleted or disabled after the first check", async () => {
    for (const [change, expected] of [
      [{ deletedAt: new Date() }, "LEAD_SOURCE_NOT_FOUND"],
      [{ isActive: false }, "LEAD_SOURCE_DISABLED"],
    ] as const) {
      const { store } = lists([item("source", change)]);
      expect(
        await code(
          lockPickedLists(store, tx, "ws", PROJECT, {
            funnelStageId: null,
            leadSourceId: "source",
            stageField: "funnelStageId",
          }),
        ),
      ).toBe(expected);
    }
  });

  it("locks nothing when nothing new was picked", async () => {
    const { store, share } = lists([]);
    await lockPickedLists(store, tx, "ws", PROJECT, {
      funnelStageId: null,
      leadSourceId: null,
      stageField: "funnelStageId",
    });
    expect(share).not.toHaveBeenCalled();
  });
});
