import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  FeeHeadListView,
  FeeHeadView,
  FeeStructureListView,
  FeeStructureView,
} from "@/src/preschool/application/fee-views";

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
import { POST as archiveHead } from "./heads/[id]/archive/route";
import { POST as headDetails } from "./heads/[id]/details/route";
import { POST as restoreHead } from "./heads/[id]/restore/route";
import { GET as listHeads, POST as createHead } from "./heads/route";
import { POST as removeStructure } from "./structures/[id]/remove/route";
import {
  GET as listStructures,
  POST as saveStructure,
} from "./structures/route";
import {
  codeOf,
  emptyRequest,
  feeHeadId,
  getRequest,
  idContext,
  jsonRequest,
  programmeId,
  setStructure,
} from "./testing";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const HEAD = "fs-head@example.test";
const OTHER_HEAD = "fs-head-b@example.test";
const TEACHER = "fs-teacher@example.test";
const PARENT = "fs-parent@example.test";

describe("Fee Heads and Fee Structures", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;

  beforeAll(async () => {
    [preschool, other] = await Promise.all([
      seedPreschool({ centres: 2 }),
      seedPreschool({ name: "Other School" }),
    ]);
    const classroomId = await addClassroom(preschool);
    await addStaff(preschool, { role: "centre_head", email: HEAD });
    await addStaff(preschool, {
      role: "centre_head",
      email: OTHER_HEAD,
      centreId: preschool.centreIds[1],
    });
    await addStaff(preschool, {
      role: "teacher",
      email: TEACHER,
      classroomIds: [classroomId],
    });
    await addChild(preschool, { classroomId, motherEmail: PARENT });
  });

  afterAll(async () => {
    await Promise.all([removePreschool(preschool), removePreschool(other)]);
  });

  describe("Fee Heads", () => {
    it("lists the seeded Fee Heads to managers only", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await listHeads(getRequest("/heads"));
      expect(response.status).toBe(StatusCodes.OK);
      expect(
        ((await response.json()) as FeeHeadListView).items.map(
          (head) => head.name,
        ),
      ).toEqual([
        "Admission fee",
        "Tuition",
        "Kit & books",
        "Uniform",
        "Activity fee",
        "Daycare",
        "Transport",
        "Security deposit",
      ]);
      signInWithEmail(preschool, "teacher", TEACHER);
      expect((await listHeads(getRequest("/heads"))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      signInWithEmail(preschool, "parent", PARENT);
      expect((await listHeads(getRequest("/heads"))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
    });

    it("lets only the Owner add one, with a unique name", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      expect(
        (await createHead(jsonRequest({ name: "Trip", kind: "one_time" })))
          .status,
      ).toBe(StatusCodes.FORBIDDEN);
      signInAsOwner(preschool);
      const response = await createHead(
        jsonRequest({
          name: " Field  trip ",
          kind: "one_time",
          refundable: false,
        }),
      );
      expect(response.status).toBe(StatusCodes.CREATED);
      expect(await response.json()).toMatchObject({
        name: "Field trip",
        kind: "one_time",
        royaltyBearing: false,
        sortOrder: 8,
        isArchived: false,
      });
      const duplicate = await createHead(
        jsonRequest({ name: "tuition", kind: "recurring" }),
      );
      expect(duplicate.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(duplicate)).toBe("FEE_HEAD_NAME_IN_USE");
    });

    it("changes details, but not the kind of a head on a Fee Structure", async () => {
      signInAsOwner(preschool);
      const uniform = feeHeadId(preschool, "Uniform");
      const renamed = await headDetails(
        jsonRequest({
          name: "Uniform set",
          kind: "recurring",
          royaltyBearing: true,
        }),
        idContext(uniform),
      );
      expect(renamed.status).toBe(StatusCodes.OK);
      expect(await renamed.json()).toMatchObject({
        name: "Uniform set",
        kind: "recurring",
        royaltyBearing: true,
      });
      await setStructure(preschool, {
        programme: "LKG",
        lines: [{ head: "Uniform", amountPaise: 100, frequency: "annual" }],
      });
      const locked = await headDetails(
        jsonRequest({ name: "Uniform set", kind: "one_time" }),
        idContext(uniform),
      );
      expect(locked.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(locked)).toBe("FEE_HEAD_KIND_LOCKED");
    });

    it("archives and restores; a restored name must be free", async () => {
      signInAsOwner(preschool);
      const transport = feeHeadId(preschool, "Transport");
      const archived = await archiveHead(emptyRequest(), idContext(transport));
      expect(((await archived.json()) as FeeHeadView).isArchived).toBe(true);
      const listed = (await (
        await listHeads(getRequest("/heads", { includeArchived: "true" }))
      ).json()) as FeeHeadListView;
      expect(listed.items.find((head) => head.id === transport)).toMatchObject({
        isArchived: true,
      });
      await createHead(jsonRequest({ name: "Transport", kind: "recurring" }));
      const clash = await restoreHead(emptyRequest(), idContext(transport));
      expect(clash.status).toBe(StatusCodes.CONFLICT);
    });

    it("answers 404 for another Workspace's Fee Head", async () => {
      signInAsOwner(preschool);
      const foreign = feeHeadId(other, "Tuition");
      expect(
        (
          await headDetails(
            jsonRequest({ name: "Mine", kind: "recurring" }),
            idContext(foreign),
          )
        ).status,
      ).toBe(StatusCodes.NOT_FOUND);
      expect(
        (await archiveHead(emptyRequest(), idContext(foreign))).status,
      ).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe("Fee Structures", () => {
    function saveBody(input: {
      centreId: string | null;
      programme?: string;
      items: { head: string; amountPaise: number; frequency: string }[];
    }) {
      return jsonRequest({
        academicYearId: preschool.academicYearId,
        programmeId: programmeId(
          preschool,
          input.programme ?? "Nursery (Pre-KG)",
        ),
        centreId: input.centreId,
        items: input.items.map((item) => ({
          feeHeadId: feeHeadId(preschool, item.head),
          amountPaise: item.amountPaise,
          frequency: item.frequency,
        })),
      });
    }

    async function structuresFor(centreId?: string) {
      const response = await listStructures(
        getRequest("/structures", centreId == null ? {} : { centreId }),
      );
      expect(response.status).toBe(StatusCodes.OK);
      const body = (await response.json()) as FeeStructureListView;
      const nursery = body.items.find(
        (item) => item.programmeName === "Nursery (Pre-KG)",
      );
      return { body, nursery };
    }

    it("lets the Owner save the Workspace default, replacing every line", async () => {
      signInAsOwner(preschool);
      const first = await saveStructure(
        saveBody({
          centreId: null,
          items: [
            {
              head: "Admission fee",
              amountPaise: 1_000_000,
              frequency: "one_time",
            },
            { head: "Tuition", amountPaise: 300_000, frequency: "monthly" },
            { head: "Kit & books", amountPaise: 400_000, frequency: "annual" },
          ],
        }),
      );
      expect(first.status).toBe(StatusCodes.OK);
      const saved = (await first.json()) as FeeStructureView;
      expect(saved).toMatchObject({
        centreId: null,
        annualPaise: 1_000_000 + 12 * 300_000 + 400_000,
      });
      const second = await saveStructure(
        saveBody({
          centreId: null,
          items: [
            {
              head: "Admission fee",
              amountPaise: 1_000_000,
              frequency: "one_time",
            },
            { head: "Tuition", amountPaise: 1_000_000, frequency: "term" },
          ],
        }),
      );
      const replaced = (await second.json()) as FeeStructureView;
      expect(replaced.id).toBe(saved.id);
      expect(replaced.items.map((item) => item.frequency)).toEqual([
        "one_time",
        "term",
      ]);

      const { body, nursery } = await structuresFor();
      expect(body).toMatchObject({
        academicYear: { id: preschool.academicYearId, name: "2026–27" },
        centreId: null,
        mayOverride: null,
      });
      expect(nursery).toMatchObject({
        default: { id: saved.id },
        override: null,
        effective: { id: saved.id },
      });
    });

    it("refuses a frequency the Fee Head's kind does not allow", async () => {
      signInAsOwner(preschool);
      const response = await saveStructure(
        saveBody({
          centreId: null,
          items: [
            { head: "Admission fee", amountPaise: 100, frequency: "monthly" },
          ],
        }),
      );
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(response)).toBe("FEE_FREQUENCY_INVALID");
    });

    it("leaves the default to the Owner and lets a Centre Head override when allowed", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const defaultByHead = await saveStructure(
        saveBody({ centreId: null, items: [] }),
      );
      expect(defaultByHead.status).toBe(StatusCodes.FORBIDDEN);

      const override = await saveStructure(
        saveBody({
          centreId: preschool.centreId,
          items: [{ head: "Tuition", amountPaise: 900_000, frequency: "term" }],
        }),
      );
      expect(override.status).toBe(StatusCodes.OK);
      const saved = (await override.json()) as FeeStructureView;
      expect(saved.centreId).toBe(preschool.centreId);

      const { body, nursery } = await structuresFor(preschool.centreId);
      expect(body.mayOverride).toBe(true);
      expect(nursery?.override?.id).toBe(saved.id);
      expect(nursery?.effective?.id).toBe(saved.id);
      expect(nursery?.default?.centreId).toBeNull();
    });

    it("refuses a Centre Head whose Centre may not override, but not the Owner", async () => {
      await prisma.preschoolCentre.update({
        where: { id: preschool.centreId },
        data: { mayOverrideFees: false },
      });
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await saveStructure(
        saveBody({ centreId: preschool.centreId, items: [] }),
      );
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(response)).toBe("FEE_OVERRIDE_NOT_ALLOWED");
      signInAsOwner(preschool);
      expect(
        (
          await saveStructure(
            saveBody({
              centreId: preschool.centreId,
              items: [
                { head: "Tuition", amountPaise: 950_000, frequency: "term" },
              ],
            }),
          )
        ).status,
      ).toBe(StatusCodes.OK);
      await prisma.preschoolCentre.update({
        where: { id: preschool.centreId },
        data: { mayOverrideFees: true },
      });
    });

    it("answers CENTRE_FORBIDDEN to another Centre's Head and 403 to a Teacher", async () => {
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      const response = await saveStructure(
        saveBody({ centreId: preschool.centreId, items: [] }),
      );
      expect(await codeOf(response)).toBe("CENTRE_FORBIDDEN");
      expect(
        await codeOf(
          await listStructures(
            getRequest("/structures", { centreId: preschool.centreId }),
          ),
        ),
      ).toBe("CENTRE_FORBIDDEN");
      signInWithEmail(preschool, "teacher", TEACHER);
      expect((await listStructures(getRequest("/structures"))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      expect(
        (await saveStructure(saveBody({ centreId: null, items: [] }))).status,
      ).toBe(StatusCodes.FORBIDDEN);
    });

    it("answers 404 for another Workspace's Fee Head, Programme or structure", async () => {
      signInAsOwner(preschool);
      const foreignHead = await saveStructure(
        jsonRequest({
          academicYearId: preschool.academicYearId,
          programmeId: programmeId(preschool, "UKG"),
          centreId: null,
          items: [
            {
              feeHeadId: feeHeadId(other, "Tuition"),
              amountPaise: 1,
              frequency: "term",
            },
          ],
        }),
      );
      expect(foreignHead.status).toBe(StatusCodes.NOT_FOUND);
      const foreignProgramme = await saveStructure(
        jsonRequest({
          academicYearId: preschool.academicYearId,
          programmeId: programmeId(other, "UKG"),
          centreId: null,
          items: [],
        }),
      );
      expect(foreignProgramme.status).toBe(StatusCodes.NOT_FOUND);
      const foreignStructure = await setStructure(other, {
        programme: "UKG",
        centreId: other.centreId,
        lines: [],
      });
      expect(
        (await removeStructure(emptyRequest(), idContext(foreignStructure)))
          .status,
      ).toBe(StatusCodes.NOT_FOUND);
    });

    it("removes a Centre's own amounts, never the default", async () => {
      signInAsOwner(preschool);
      const { nursery } = await structuresFor(preschool.centreId);
      const overrideId = nursery?.override?.id ?? "";
      const defaultId = nursery?.default?.id ?? "";
      const response = await removeStructure(
        emptyRequest(),
        idContext(overrideId),
      );
      expect(response.status).toBe(StatusCodes.NO_CONTENT);
      const after = await structuresFor(preschool.centreId);
      expect(after.nursery?.override).toBeNull();
      expect(after.nursery?.effective?.id).toBe(defaultId);
      const fallback = await removeStructure(
        emptyRequest(),
        idContext(defaultId),
      );
      expect(fallback.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(fallback)).toBe("FEE_STRUCTURE_DEFAULT");
    });
  });
});
