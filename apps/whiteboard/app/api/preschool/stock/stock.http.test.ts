import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  ChildStockIssuedView,
  StockItemView,
  StockLedgerView,
  StockMovementResultView,
  StockOnHandView,
} from "@/src/preschool/application/stock-views";

import {
  addChild,
  addClassroom,
  addStaff,
  removePreschool,
  seedPreschool,
  signInAsOwner,
  signInWithEmail,
  type PreschoolFixture,
} from "../_lib/testing";
import { POST as adjust } from "./adjust/route";
import { GET as childIssued } from "./children/[childId]/route";
import { POST as issueToChild } from "./issue-to-child/route";
import { POST as issueToClassroom } from "./issue-to-classroom/route";
import { POST as issueToStaff } from "./issue-to-staff/route";
import { POST as archiveItem } from "./items/[id]/archive/route";
import { POST as itemDetails } from "./items/[id]/details/route";
import { POST as restoreItem } from "./items/[id]/restore/route";
import { GET as listItems, POST as createItem } from "./items/route";
import { GET as movements } from "./movements/route";
import { POST as receive } from "./receive/route";
import { GET as onHand } from "./route";
import {
  childContext,
  codeOf,
  emptyRequest,
  freezeToday,
  getRequest,
  idContext,
  jsonRequest,
  unfreezeToday,
} from "./testing";
import { POST as transfer } from "./transfer/route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const HEAD = "st-head@example.test";
const OTHER_HEAD = "st-head-b@example.test";
const TEACHER = "st-teacher@example.test";
const PARENT = "st-parent@example.test";
const OTHER_PARENT = "st-parent-b@example.test";

async function created(response: Response): Promise<StockMovementResultView> {
  expect(response.status).toBe(StatusCodes.CREATED);
  return (await response.json()) as StockMovementResultView;
}

describe("/api/preschool/stock", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let branch: string;
  let nursery: string;
  let helperId: string;
  let branchStaffId: string;
  let aarav: string;
  let diya: string;
  let branchChild: string;
  let foreignChild: string;
  let kit: StockItemView;
  let notebook: StockItemView;
  let foreignItem: StockItemView;

  async function addItem(
    fixture: PreschoolFixture,
    body: Record<string, unknown>,
  ): Promise<StockItemView> {
    signInAsOwner(fixture);
    const response = await createItem(jsonRequest(body));
    expect(response.status).toBe(StatusCodes.CREATED);
    return (await response.json()) as StockItemView;
  }

  async function stockAt(
    centreId: string,
    query: Record<string, string> = {},
  ): Promise<StockOnHandView> {
    const response = await onHand(getRequest("", { centreId, ...query }));
    expect(response.status).toBe(StatusCodes.OK);
    return (await response.json()) as StockOnHandView;
  }

  beforeAll(async () => {
    freezeToday();
    [preschool, other] = await Promise.all([
      seedPreschool({ centres: 2 }),
      seedPreschool({ name: "Other School" }),
    ]);
    branch = preschool.centreIds[1] ?? "";
    nursery = await addClassroom(preschool);
    const branchClassroom = await addClassroom(preschool, {
      centreId: branch,
      name: "Branch Nursery",
    });
    await addStaff(preschool, { role: "centre_head", email: HEAD });
    await addStaff(preschool, {
      role: "centre_head",
      email: OTHER_HEAD,
      centreId: branch,
    });
    await addStaff(preschool, {
      role: "teacher",
      email: TEACHER,
      classroomIds: [nursery],
    });
    helperId = await addStaff(preschool, { role: "helper", name: "Lakshmi" });
    branchStaffId = await addStaff(preschool, {
      role: "helper",
      centreId: branch,
    });
    ({ childId: aarav } = await addChild(preschool, {
      classroomId: nursery,
      firstName: "Aarav",
      motherEmail: PARENT,
    }));
    ({ childId: diya } = await addChild(preschool, {
      classroomId: nursery,
      firstName: "Diya",
      motherEmail: OTHER_PARENT,
    }));
    ({ childId: branchChild } = await addChild(preschool, {
      classroomId: branchClassroom,
    }));
    ({ childId: foreignChild } = await addChild(other, {
      classroomId: await addClassroom(other),
    }));
    foreignItem = await addItem(other, {
      name: "Their kit",
      category: "kit",
      kind: "consumable",
      unit: "set",
    });
  });

  afterAll(async () => {
    unfreezeToday();
    await Promise.all([removePreschool(preschool), removePreschool(other)]);
  });

  describe("Stock Items", () => {
    it("lets only the Owner add one, with a unique name", async () => {
      kit = await addItem(preschool, {
        name: " Nursery  kit ",
        category: "kit",
        kind: "consumable",
        unit: "Set",
        reorderLevel: 5,
      });
      expect(kit).toMatchObject({
        name: "Nursery kit",
        unit: "set",
        reorderLevel: 5,
        isArchived: false,
      });
      notebook = await addItem(preschool, {
        name: "Four-line notebook",
        category: "notebooks",
        kind: "consumable",
        unit: "piece",
      });
      const duplicate = await createItem(
        jsonRequest({
          name: "nursery kit",
          category: "kit",
          kind: "consumable",
          unit: "set",
        }),
      );
      expect(duplicate.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(duplicate)).toBe("STOCK_ITEM_NAME_IN_USE");
      signInWithEmail(preschool, "teacher", HEAD);
      expect(
        (
          await createItem(
            jsonRequest({
              name: "Crayons",
              category: "stationery",
              kind: "consumable",
              unit: "box",
            }),
          )
        ).status,
      ).toBe(StatusCodes.FORBIDDEN);
    });

    it("lists items to Teachers for pickers, not to Parents", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      const response = await listItems(getRequest("/items"));
      expect(response.status).toBe(StatusCodes.OK);
      expect(
        ((await response.json()) as { items: StockItemView[] }).items.map(
          (item) => item.name,
        ),
      ).toEqual(["Four-line notebook", "Nursery kit"]);
      signInWithEmail(preschool, "parent", PARENT);
      expect((await listItems(getRequest("/items"))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
    });

    it("changes, archives and restores; 404 across Workspaces", async () => {
      signInAsOwner(preschool);
      const chairs = await addItem(preschool, {
        name: "Chair",
        category: "furniture_equipment",
        kind: "asset",
        unit: "piece",
      });
      const changed = await itemDetails(
        jsonRequest({
          name: "Small chair",
          category: "furniture_equipment",
          kind: "asset",
          unit: "piece",
          reorderLevel: 2,
        }),
        idContext(chairs.id),
      );
      expect(await changed.json()).toMatchObject({
        name: "Small chair",
        reorderLevel: 2,
      });
      const archived = await archiveItem(emptyRequest(), idContext(chairs.id));
      expect(((await archived.json()) as StockItemView).isArchived).toBe(true);
      const restored = await restoreItem(emptyRequest(), idContext(chairs.id));
      expect(((await restored.json()) as StockItemView).isArchived).toBe(false);
      await archiveItem(emptyRequest(), idContext(chairs.id));
      expect(
        (await archiveItem(emptyRequest(), idContext(foreignItem.id))).status,
      ).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe("receiving and stock on hand", () => {
    it("receives several items on one bill", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const result = await created(
        await receive(
          jsonRequest({
            centreId: preschool.centreId,
            supplierName: "Sri Books",
            billNumber: "SB-101",
            lines: [
              { itemId: kit.id, quantity: 20, unitCostPaise: 85_000 },
              { itemId: notebook.id, quantity: 100 },
            ],
          }),
        ),
      );
      expect(result.movementIds).toHaveLength(2);
      expect(result.balances).toEqual(
        expect.arrayContaining([
          { centreId: preschool.centreId, itemId: kit.id, onHand: 20 },
          { centreId: preschool.centreId, itemId: notebook.id, onHand: 100 },
        ]),
      );
      const stock = await stockAt(preschool.centreId);
      expect(stock).toMatchObject({ itemsInStock: 2, lowItems: 0 });
      expect(stock.items.find((row) => row.itemId === kit.id)).toMatchObject({
        onHand: 20,
        low: false,
        lastMovedOn: "2026-11-25",
      });
      expect(
        (await stockAt(preschool.centreId, { category: "kit" })).items.map(
          (row) => row.name,
        ),
      ).toEqual(["Nursery kit"]);
    });

    it("refuses a future date, an archived or foreign item, and a repeated line", async () => {
      signInAsOwner(preschool);
      const base = { centreId: preschool.centreId };
      const future = await receive(
        jsonRequest({
          ...base,
          movedOn: "2026-11-26",
          lines: [{ itemId: kit.id, quantity: 1 }],
        }),
      );
      expect(await codeOf(future)).toBe("STOCK_DATE_IN_FUTURE");
      const archived = await prisma.preschoolStockItem.findFirstOrThrow({
        where: { workspaceId: preschool.workspaceId, name: "Small chair" },
      });
      const archivedResponse = await receive(
        jsonRequest({ ...base, lines: [{ itemId: archived.id, quantity: 1 }] }),
      );
      expect(archivedResponse.status).toBe(StatusCodes.CONFLICT);
      expect(
        (
          await receive(
            jsonRequest({
              ...base,
              lines: [{ itemId: foreignItem.id, quantity: 1 }],
            }),
          )
        ).status,
      ).toBe(StatusCodes.NOT_FOUND);
      const repeated = await receive(
        jsonRequest({
          ...base,
          lines: [
            { itemId: kit.id, quantity: 1 },
            { itemId: kit.id, quantity: 1 },
          ],
        }),
      );
      expect(await codeOf(repeated)).toBe("STOCK_DUPLICATE_ITEM");
    });

    it("answers 403 to a Teacher and CENTRE_FORBIDDEN to another Centre's Head", async () => {
      const body = {
        centreId: preschool.centreId,
        lines: [{ itemId: kit.id, quantity: 1 }],
      };
      signInWithEmail(preschool, "teacher", TEACHER);
      expect((await receive(jsonRequest(body))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      expect(
        (await onHand(getRequest("", { centreId: preschool.centreId }))).status,
      ).toBe(StatusCodes.FORBIDDEN);
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      expect(await codeOf(await receive(jsonRequest(body)))).toBe(
        "CENTRE_FORBIDDEN",
      );
      expect(
        await codeOf(
          await onHand(getRequest("", { centreId: preschool.centreId })),
        ),
      ).toBe("CENTRE_FORBIDDEN");
    });
  });

  describe("issuing and adjusting", () => {
    it("issues to a Child, a Classroom and a Staff member", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const toChild = await created(
        await issueToChild(
          jsonRequest({
            centreId: preschool.centreId,
            childId: aarav,
            lines: [
              { itemId: kit.id, quantity: 1 },
              { itemId: notebook.id, quantity: 4 },
            ],
          }),
        ),
      );
      expect(toChild.balances).toEqual(
        expect.arrayContaining([
          { centreId: preschool.centreId, itemId: kit.id, onHand: 19 },
        ]),
      );
      await created(
        await issueToClassroom(
          jsonRequest({
            centreId: preschool.centreId,
            classroomId: nursery,
            lines: [{ itemId: notebook.id, quantity: 10 }],
          }),
        ),
      );
      await created(
        await issueToStaff(
          jsonRequest({
            centreId: preschool.centreId,
            staffId: helperId,
            lines: [{ itemId: notebook.id, quantity: 2 }],
          }),
        ),
      );
      const stock = await stockAt(preschool.centreId);
      expect(
        stock.items.find((row) => row.itemId === notebook.id)?.onHand,
      ).toBe(84);
    });

    it("never goes below zero", async () => {
      signInAsOwner(preschool);
      const response = await issueToChild(
        jsonRequest({
          centreId: preschool.centreId,
          childId: diya,
          lines: [{ itemId: kit.id, quantity: 100 }],
        }),
      );
      expect(response.status).toBe(StatusCodes.CONFLICT);
      expect(await response.json()).toMatchObject({
        code: "STOCK_INSUFFICIENT",
        details: { onHand: 19 },
      });
      const adjustDown = await adjust(
        jsonRequest({
          centreId: preschool.centreId,
          itemId: kit.id,
          quantity: -20,
          note: "Count",
        }),
      );
      expect(await codeOf(adjustDown)).toBe("STOCK_INSUFFICIENT");
    });

    it("refuses a Child, Classroom or Staff member of another Centre or Workspace", async () => {
      signInAsOwner(preschool);
      const lines = [{ itemId: kit.id, quantity: 1 }];
      expect(
        await codeOf(
          await issueToChild(
            jsonRequest({
              centreId: preschool.centreId,
              childId: branchChild,
              lines,
            }),
          ),
        ),
      ).toBe("STOCK_CHILD_OTHER_CENTRE");
      expect(
        (
          await issueToChild(
            jsonRequest({
              centreId: preschool.centreId,
              childId: foreignChild,
              lines,
            }),
          )
        ).status,
      ).toBe(StatusCodes.NOT_FOUND);
      expect(
        await codeOf(
          await issueToStaff(
            jsonRequest({
              centreId: preschool.centreId,
              staffId: branchStaffId,
              lines,
            }),
          ),
        ),
      ).toBe("STOCK_STAFF_OTHER_CENTRE");
      signInWithEmail(preschool, "teacher", TEACHER);
      expect(
        (
          await issueToChild(
            jsonRequest({
              centreId: preschool.centreId,
              childId: aarav,
              lines,
            }),
          )
        ).status,
      ).toBe(StatusCodes.FORBIDDEN);
    });

    it("adjusts with a reason, and shows the item as low", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const noReason = await adjust(
        jsonRequest({
          centreId: preschool.centreId,
          itemId: kit.id,
          quantity: -3,
          note: " ",
        }),
      );
      expect(noReason.status).toBe(StatusCodes.BAD_REQUEST);
      const result = await created(
        await adjust(
          jsonRequest({
            centreId: preschool.centreId,
            itemId: kit.id,
            quantity: -14,
            note: "Water damage",
          }),
        ),
      );
      expect(result.balances[0]?.onHand).toBe(5);
      const low = await stockAt(preschool.centreId, { lowOnly: "true" });
      expect(low.items.map((row) => row.itemId)).toEqual([kit.id]);
      expect(low.lowItems).toBe(1);
    });

    it("lets exactly one of two issues through when together they exceed stock", async () => {
      signInAsOwner(preschool);
      const issue = (childId: string) =>
        issueToChild(
          jsonRequest({
            centreId: preschool.centreId,
            childId,
            lines: [{ itemId: kit.id, quantity: 4 }],
          }),
        );
      const responses = await Promise.all([issue(aarav), issue(diya)]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        StatusCodes.CREATED,
        StatusCodes.CONFLICT,
      ]);
      const stock = await stockAt(preschool.centreId);
      expect(stock.items.find((row) => row.itemId === kit.id)?.onHand).toBe(1);
    });
  });

  describe("transfers", () => {
    it("writes both sides with one transferId, Owner only", async () => {
      signInAsOwner(preschool);
      await created(
        await receive(
          jsonRequest({
            centreId: preschool.centreId,
            lines: [{ itemId: kit.id, quantity: 9 }],
          }),
        ),
      );
      signInWithEmail(preschool, "teacher", HEAD);
      const body = {
        fromCentreId: preschool.centreId,
        toCentreId: branch,
        note: "Kits for the new batch",
        lines: [{ itemId: kit.id, quantity: 4 }],
      };
      expect((await transfer(jsonRequest(body))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      signInAsOwner(preschool);
      const result = await created(await transfer(jsonRequest(body)));
      expect(result.balances).toEqual(
        expect.arrayContaining([
          { centreId: preschool.centreId, itemId: kit.id, onHand: 6 },
          { centreId: branch, itemId: kit.id, onHand: 4 },
        ]),
      );
      const rows = await prisma.preschoolStockMovement.findMany({
        where: { id: { in: result.movementIds } },
      });
      expect(new Set(rows.map((row) => row.transferId)).size).toBe(1);
      expect(rows.find((row) => row.kind === "transfer_out")).toMatchObject({
        centreId: preschool.centreId,
        otherCentreId: branch,
        quantityDelta: -4,
      });
      expect(rows.find((row) => row.kind === "transfer_in")).toMatchObject({
        centreId: branch,
        otherCentreId: preschool.centreId,
        quantityDelta: 4,
      });

      const same = await transfer(
        jsonRequest({ ...body, toCentreId: preschool.centreId }),
      );
      expect(await codeOf(same)).toBe("STOCK_TRANSFER_SAME_CENTRE");
      const tooMany = await transfer(
        jsonRequest({ ...body, lines: [{ itemId: kit.id, quantity: 7 }] }),
      );
      expect(await codeOf(tooMany)).toBe("STOCK_INSUFFICIENT");
    });
  });

  describe("ledger and a Child's stock", () => {
    it("lists one item's movements newest first with a running balance", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await movements(
        getRequest("/movements", {
          centreId: preschool.centreId,
          itemId: kit.id,
        }),
      );
      expect(response.status).toBe(StatusCodes.OK);
      const ledger = (await response.json()) as StockLedgerView;
      expect(ledger.total).toBe(6);
      expect(
        ledger.items.map((row) => [
          row.kind,
          row.quantityDelta,
          row.balanceAfter,
        ]),
      ).toEqual([
        ["transfer_out", -4, 6],
        ["received", 9, 10],
        ["issued_to_child", -4, 1],
        ["adjusted", -14, 5],
        ["issued_to_child", -1, 19],
        ["received", 20, 20],
      ]);
      expect(ledger.items[0]?.otherCentre?.id).toBe(branch);
      expect(ledger.items.at(-1)).toMatchObject({
        supplierName: "Sri Books",
        billNumber: "SB-101",
        unitCostPaise: 85_000,
        recordedByName: "st-head",
      });
    });

    it("filters by Child and kind, and pages", async () => {
      signInAsOwner(preschool);
      const forAarav = (await (
        await movements(
          getRequest("/movements", {
            centreId: preschool.centreId,
            childId: aarav,
          }),
        )
      ).json()) as StockLedgerView;
      expect(forAarav.items.every((row) => row.child?.id === aarav)).toBe(true);
      expect(forAarav.items[0]?.balanceAfter).toBeNull();
      const toStaff = (await (
        await movements(
          getRequest("/movements", {
            centreId: preschool.centreId,
            kind: "issued_to_staff",
          }),
        )
      ).json()) as StockLedgerView;
      expect(toStaff.items.map((row) => row.staff?.name)).toEqual(["Lakshmi"]);
      const first = (await (
        await movements(
          getRequest("/movements", {
            centreId: preschool.centreId,
            limit: "3",
          }),
        )
      ).json()) as StockLedgerView;
      expect(first.items).toHaveLength(3);
      const second = (await (
        await movements(
          getRequest("/movements", {
            centreId: preschool.centreId,
            limit: "3",
            cursor: first.nextCursor ?? "",
          }),
        )
      ).json()) as StockLedgerView;
      expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
      signInWithEmail(preschool, "teacher", TEACHER);
      expect(
        (
          await movements(
            getRequest("/movements", { centreId: preschool.centreId }),
          )
        ).status,
      ).toBe(StatusCodes.FORBIDDEN);
    });

    it("shows a Child's issued stock to managers, the Class Teacher and the Child's Parent", async () => {
      for (const signIn of [
        () => {
          signInAsOwner(preschool);
        },
        () => signInWithEmail(preschool, "teacher", TEACHER),
        () => signInWithEmail(preschool, "parent", PARENT),
      ]) {
        signIn();
        const response = await childIssued(getRequest(""), childContext(aarav));
        expect(response.status).toBe(StatusCodes.OK);
        const body = (await response.json()) as ChildStockIssuedView;
        const rows = body.items.map((row) => [row.itemName, row.quantity]);
        expect(rows).toContainEqual(["Four-line notebook", 4]);
        expect(rows).toContainEqual(["Nursery kit", 1]);
        expect(body.items.every((row) => row.quantity > 0)).toBe(true);
      }
      signInWithEmail(preschool, "parent", OTHER_PARENT);
      expect(
        await codeOf(await childIssued(getRequest(""), childContext(aarav))),
      ).toBe("CHILD_FORBIDDEN");
      signInWithEmail(preschool, "teacher", TEACHER);
      expect(
        (await childIssued(getRequest(""), childContext(branchChild))).status,
      ).toBe(StatusCodes.FORBIDDEN);
      signInAsOwner(preschool);
      expect(
        (await childIssued(getRequest(""), childContext(foreignChild))).status,
      ).toBe(StatusCodes.NOT_FOUND);
    });
  });
});
