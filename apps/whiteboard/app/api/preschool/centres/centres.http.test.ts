import { getAuth } from "@repo/auth/server";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  CentreListView,
  CentreView,
} from "@/src/preschool/application/centre-views";

import {
  addChild,
  addClassroom,
  addStaff,
  removePreschool,
  seedPreschool,
  signInAsOwner,
  signInWithEmail,
  signOut,
  type PreschoolFixture,
} from "../_lib/testing";
import { POST as closeCentre } from "./[id]/close/route";
import { POST as updateDetails } from "./[id]/details/route";
import { POST as updateFranchise } from "./[id]/franchise/route";
import { POST as reopenCentre } from "./[id]/reopen/route";
import { GET as getCentre } from "./[id]/route";
import { GET as listCentres, POST as createCentre } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const HEAD_EMAIL = "head@centres.example.test";
const TEACHER_EMAIL = "teacher@centres.example.test";

function post(body: unknown): Request {
  return new Request("http://localhost/api/preschool/centres", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function read(
  response: Response,
): Promise<{ status: number; body: CentreView }> {
  return {
    status: response.status,
    body: (await response.json()) as CentreView,
  };
}

async function readList(response: Response): Promise<CentreListView> {
  return (await response.json()) as CentreListView;
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

const FRANCHISED = {
  name: "Little Steps Porur",
  code: "lspr",
  city: "Chennai",
  pincode: "600116",
  ownership: "franchised",
  franchiseeName: "Priya Raman",
  franchiseePhone: "9840012345",
  agreementStartOn: "2026-06-01",
  agreementEndOn: "2031-05-31",
  royaltyPercent: 12.5,
};

describe("/api/preschool/centres", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let busyCentreId: string;
  let headCentreId: string;

  beforeAll(async () => {
    preschool = await seedPreschool({ centres: 3 });
    other = await seedPreschool({ name: "Other Kids" });
    busyCentreId = preschool.centreId;
    headCentreId = preschool.centreIds[1] ?? "";
    const classroomId = await addClassroom(preschool);
    await addClassroom(preschool, { name: "Nursery B" });
    await addChild(preschool, { classroomId });
    await addChild(preschool, { classroomId });
    await addStaff(preschool, {
      role: "centre_head",
      email: HEAD_EMAIL,
      centreId: headCentreId,
    });
    await addStaff(preschool, { role: "teacher", email: TEACHER_EMAIL });
  });

  afterAll(async () => {
    await removePreschool(preschool);
    await removePreschool(other);
  });

  it("answers 401 without a Session", async () => {
    signOut();
    expect((await listCentres()).status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("lists every Centre for the Owner, with active Children and Classrooms", async () => {
    signInAsOwner(preschool);
    const response = await listCentres();
    expect(response.status).toBe(StatusCodes.OK);
    const body = await readList(response);
    expect(body.items.map((centre) => centre.id).sort()).toEqual(
      [...preschool.centreIds].sort(),
    );
    const busy = body.items.find((centre) => centre.id === busyCentreId);
    expect(busy).toMatchObject({
      ownership: "company_owned",
      activeChildren: 2,
      classrooms: 2,
      royaltyPercent: 0,
    });
    const branch = body.items.find((centre) => centre.id === headCentreId);
    expect(branch).toMatchObject({
      ownership: "franchised",
      royaltyPercent: 10,
      activeChildren: 0,
    });
  });

  it("adds a Franchised Centre for the Owner", async () => {
    signInAsOwner(preschool);
    const created = await read(await createCentre(post(FRANCHISED)));
    expect(created.status).toBe(StatusCodes.CREATED);
    expect(created.body).toMatchObject({
      name: "Little Steps Porur",
      code: "LSPR",
      status: "active",
      ownership: "franchised",
      franchiseeName: "Priya Raman",
      agreementStartOn: "2026-06-01",
      agreementEndOn: "2031-05-31",
      royaltyPercent: 12.5,
      mayOverrideFees: true,
      activeChildren: 0,
      classrooms: 0,
    });
    const fetched = await read(
      await getCentre(
        new Request("http://localhost"),
        context(created.body.id),
      ),
    );
    expect(fetched.body).toEqual(created.body);
  });

  it("refuses a code already used in the Workspace, but not in another", async () => {
    signInAsOwner(preschool);
    const taken = await createCentre(
      post({ name: "Copy", code: "b2", ownership: "company_owned" }),
    );
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await errorCode(taken)).toBe("CENTRE_CODE_IN_USE");

    signInAsOwner(other);
    expect(
      (
        await createCentre(
          post({ name: "Elsewhere", code: "B2", ownership: "company_owned" }),
        )
      ).status,
    ).toBe(StatusCodes.CREATED);

    signInAsOwner(preschool);
    const renamed = await updateDetails(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ name: "Main", code: "B3" }),
      }),
      context(busyCentreId),
    );
    expect(renamed.status).toBe(StatusCodes.CONFLICT);
    expect(await errorCode(renamed)).toBe("CENTRE_CODE_IN_USE");
  });

  it("checks the code, the franchisee and the royalty", async () => {
    signInAsOwner(preschool);
    const cases: [unknown, string][] = [
      [{ ...FRANCHISED, code: "L" }, "CENTRE_CODE_INVALID"],
      [{ ...FRANCHISED, code: "LS-1" }, "CENTRE_CODE_INVALID"],
      [
        { ...FRANCHISED, code: "LSX1", franchiseeName: " " },
        "FRANCHISEE_NAME_REQUIRED",
      ],
      [
        { ...FRANCHISED, code: "LSX2", royaltyPercent: 12.345 },
        "ROYALTY_INVALID",
      ],
      [
        { ...FRANCHISED, code: "LSX3", agreementEndOn: "2026-01-01" },
        "AGREEMENT_DATES_INVALID",
      ],
    ];
    for (const [body, code] of cases) {
      const response = await createCentre(post(body));
      expect(response.status, code).toBe(StatusCodes.BAD_REQUEST);
      expect(await errorCode(response)).toBe(code);
    }
    expect(
      (
        await createCentre(
          post({ ...FRANCHISED, code: "LSX4", royaltyPercent: 101 }),
        )
      ).status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });

  it("edits details and ownership", async () => {
    signInAsOwner(preschool);
    const id = preschool.centreIds[2] ?? "";
    const details = await read(
      await updateDetails(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({
            name: "Little Steps Velachery",
            code: "lsvl",
            phone: "04422223333",
            email: "Velachery@LittleSteps.in",
            addressLine: "12 Lake View Road",
            city: "Chennai",
            state: "Tamil Nadu",
            pincode: "600042",
          }),
        }),
        context(id),
      ),
    );
    expect(details.status).toBe(StatusCodes.OK);
    expect(details.body).toMatchObject({
      name: "Little Steps Velachery",
      code: "LSVL",
      email: "velachery@littlesteps.in",
      ownership: "franchised",
    });

    const owned = await read(
      await updateFranchise(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({
            ownership: "company_owned",
            franchiseeName: "Ignored",
            royaltyPercent: 9,
            mayOverrideFees: false,
          }),
        }),
        context(id),
      ),
    );
    expect(owned.body).toMatchObject({
      ownership: "company_owned",
      franchiseeName: null,
      royaltyPercent: 0,
      mayOverrideFees: false,
    });

    const franchised = await read(
      await updateFranchise(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({
            ownership: "franchised",
            franchiseeName: "Karthik S",
            royaltyPercent: 7.25,
            mayOverrideFees: true,
          }),
        }),
        context(id),
      ),
    );
    expect(franchised.body).toMatchObject({
      ownership: "franchised",
      franchiseeName: "Karthik S",
      royaltyPercent: 7.25,
    });
  });

  it("closes only a Centre with no active Children, and reopens it", async () => {
    signInAsOwner(preschool);
    const busy = await closeCentre(
      new Request("http://localhost"),
      context(busyCentreId),
    );
    expect(busy.status).toBe(StatusCodes.CONFLICT);
    expect(await errorCode(busy)).toBe("CENTRE_HAS_ACTIVE_CHILDREN");

    const id = preschool.centreIds[2] ?? "";
    const closed = await read(
      await closeCentre(new Request("http://localhost"), context(id)),
    );
    expect(closed.body.status).toBe("closed");
    const again = await closeCentre(
      new Request("http://localhost"),
      context(id),
    );
    expect(await errorCode(again)).toBe("CENTRE_ALREADY_CLOSED");

    const reopened = await read(
      await reopenCentre(new Request("http://localhost"), context(id)),
    );
    expect(reopened.body.status).toBe("active");
    const open = await reopenCentre(
      new Request("http://localhost"),
      context(id),
    );
    expect(open.status).toBe(StatusCodes.CONFLICT);
    expect(await errorCode(open)).toBe("CENTRE_NOT_CLOSED");
  });

  it("lets a Centre Head read their own Centre only, and change nothing", async () => {
    signInWithEmail(preschool, "teacher", HEAD_EMAIL);
    const list = await readList(await listCentres());
    expect(list.items.map((centre) => centre.id)).toEqual([headCentreId]);
    expect(
      (await getCentre(new Request("http://localhost"), context(headCentreId)))
        .status,
    ).toBe(StatusCodes.OK);

    const another = await getCentre(
      new Request("http://localhost"),
      context(busyCentreId),
    );
    expect(another.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(another)).toBe("CENTRE_FORBIDDEN");

    expect(
      (await createCentre(post({ ...FRANCHISED, code: "HEAD1" }))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const edits = [
      updateDetails(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ name: "Mine", code: "MINE" }),
        }),
        context(headCentreId),
      ),
      updateFranchise(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({
            ownership: "franchised",
            franchiseeName: "Me",
            royaltyPercent: 0,
            mayOverrideFees: true,
          }),
        }),
        context(headCentreId),
      ),
      closeCentre(new Request("http://localhost"), context(headCentreId)),
    ];
    for (const response of await Promise.all(edits))
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("answers 403 to a Teacher", async () => {
    signInWithEmail(preschool, "teacher", TEACHER_EMAIL);
    expect((await listCentres()).status).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await getCentre(new Request("http://localhost"), context(busyCentreId)))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("answers 404 for another Workspace's Centre, 400 for a malformed id", async () => {
    signInAsOwner(other);
    const elsewhere = [
      await getCentre(new Request("http://localhost"), context(busyCentreId)),
      await closeCentre(new Request("http://localhost"), context(busyCentreId)),
      await updateDetails(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ name: "Taken", code: "TKN" }),
        }),
        context(busyCentreId),
      ),
    ];
    for (const response of elsewhere) {
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(await errorCode(response)).toBe("CENTRE_NOT_FOUND");
    }
    expect(
      (await getCentre(new Request("http://localhost"), context("nope")))
        .status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });

  it("answers 403 NOT_A_PRESCHOOL outside a Preschool", async () => {
    vi.mocked(getAuth).mockResolvedValue(
      (await import("@repo/auth/testing")).authStateFor({
        userId: "user_ti",
        workspaceId: "org_training_only",
        role: "owner",
      }),
    );
    const response = await listCentres();
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(response)).toBe("NOT_A_PRESCHOOL");
  });
});
