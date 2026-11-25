import { randomUUID } from "node:crypto";

import { clearOutbox, emailsTo, seedWorkspaceMember } from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  StaffInvitationView,
  StaffListView,
  StaffView,
} from "@/src/preschool/application/staff-views";

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
import { POST as activate } from "./[id]/activate/route";
import { POST as deactivate } from "./[id]/deactivate/route";
import { POST as details } from "./[id]/details/route";
import { POST as invite } from "./[id]/invite/route";
import { GET, POST } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

/** Identity emails are shared by every test file, so each run gets its own. */
function uniqueEmail(name: string): string {
  return `${name}-${randomUUID()}@example.test`;
}

const HEAD = uniqueEmail("st-head");
const OTHER_HEAD = uniqueEmail("st-head-b");
const TEACHER = uniqueEmail("st-teacher");
const PARENT = uniqueEmail("st-parent");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/preschool/staff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function emptyRequest(): Request {
  return new Request("http://localhost", { method: "POST" });
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function codeOf(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

async function create(body: Record<string, unknown>) {
  const response = await POST(jsonRequest(body));
  return { status: response.status, body: (await response.json()) as unknown };
}

describe("/api/preschool/staff", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let nurseryA: string;
  let nurseryB: string;
  let branchClassroom: string;

  beforeAll(async () => {
    [preschool, other] = await Promise.all([
      seedPreschool({ centres: 2 }),
      seedPreschool({ name: "Other School" }),
    ]);
    // Invitations are sent by the identity Workspace's Owner.
    await seedWorkspaceMember({
      workspaceId: preschool.workspaceId,
      userId: preschool.ownerUserId,
      role: "owner",
      institutionType: "preschool",
    });
    nurseryA = await addClassroom(preschool);
    nurseryB = await addClassroom(preschool, { name: "Nursery B" });
    branchClassroom = await addClassroom(preschool, {
      centreId: preschool.centreIds[1],
      name: "Branch Nursery",
    });
    await addStaff(preschool, {
      role: "centre_head",
      email: HEAD,
      name: "Head A",
    });
    await addStaff(preschool, {
      role: "centre_head",
      email: OTHER_HEAD,
      centreId: preschool.centreIds[1],
    });
    await addStaff(preschool, {
      role: "teacher",
      email: TEACHER,
      classroomIds: [nurseryA],
    });
    await addChild(preschool, { classroomId: nurseryA, motherEmail: PARENT });
  });

  beforeEach(() => {
    clearOutbox();
  });

  afterAll(async () => {
    await Promise.all([removePreschool(preschool), removePreschool(other)]);
    const workspaceId = preschool.workspaceId;
    const members = await prisma.identityWorkspaceMember.findMany({
      where: { organizationId: workspaceId },
      select: { userId: true },
    });
    await prisma.identityWorkspaceInvitation.deleteMany({
      where: { organizationId: workspaceId },
    });
    await prisma.identityWorkspaceMember.deleteMany({
      where: { organizationId: workspaceId },
    });
    await prisma.identityWorkspace.deleteMany({ where: { id: workspaceId } });
    await prisma.identityUser.deleteMany({
      where: { id: { in: members.map((member) => member.userId) } },
    });
  });

  describe("POST", () => {
    it("adds a Teacher with Classrooms and invites them as a teacher member", async () => {
      signInAsOwner(preschool);
      const email = uniqueEmail("Meera");
      const { status, body } = await create({
        centreId: preschool.centreId,
        name: "  Meera  Shah ",
        role: "teacher",
        email: `  ${email.toUpperCase()} `,
        phone: "9876543210",
        designation: "Lead Teacher",
        joinedOn: "2026-06-01",
        classroomIds: [nurseryA, nurseryB],
      });
      expect(status).toBe(StatusCodes.CREATED);
      const result = body as StaffInvitationView;
      expect(result.invitation).toBe("sent");
      expect(result.staff).toMatchObject({
        centreId: preschool.centreId,
        name: "Meera Shah",
        role: "teacher",
        status: "active",
        email: email.toLowerCase(),
        phone: "9876543210",
        designation: "Lead Teacher",
        joinedOn: "2026-06-01",
        invitedAt: expect.any(String) as unknown,
        canSignIn: true,
        classrooms: [
          { id: nurseryA, name: "Nursery A" },
          { id: nurseryB, name: "Nursery B" },
        ],
      });
      const invitations = await prisma.identityWorkspaceInvitation.findMany({
        where: {
          organizationId: preschool.workspaceId,
          email: email.toLowerCase(),
        },
      });
      expect(invitations).toEqual([
        expect.objectContaining({ role: "teacher", status: "pending" }),
      ]);
      expect(emailsTo(email)).toHaveLength(1);
    });

    it("lets only the Owner add a Centre Head", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await POST(
        jsonRequest({
          centreId: preschool.centreId,
          name: "Second Head",
          role: "centre_head",
        }),
      );
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(response)).toBe("CENTRE_HEAD_OWNER_ONLY");

      signInAsOwner(preschool);
      const { status, body } = await create({
        centreId: preschool.centreIds[1],
        name: "Branch Head",
        role: "centre_head",
        email: uniqueEmail("branch-head"),
      });
      expect(status).toBe(StatusCodes.CREATED);
      expect((body as StaffInvitationView).invitation).toBe("sent");
    });

    it("adds a helper without inviting, and keeps helpers out of Classrooms", async () => {
      signInAsOwner(preschool);
      const email = uniqueEmail("helper");
      const { body } = await create({
        centreId: preschool.centreId,
        name: "Lakshmi",
        role: "helper",
        email,
      });
      expect(body).toMatchObject({
        invitation: "not_sent",
        staff: { role: "helper", canSignIn: false, invitedAt: null },
      });
      expect(emailsTo(email)).toEqual([]);

      const withClassroom = await POST(
        jsonRequest({
          centreId: preschool.centreId,
          name: "Ravi",
          role: "helper",
          classroomIds: [nurseryA],
        }),
      );
      expect(withClassroom.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(withClassroom)).toBe("CLASS_TEACHER_ROLE");
    });

    it("adds a Teacher with no email and sends nothing", async () => {
      signInAsOwner(preschool);
      const { body } = await create({
        centreId: preschool.centreId,
        name: "No Email",
        role: "teacher",
        email: "",
      });
      expect(body).toMatchObject({
        invitation: "not_sent",
        staff: { email: null },
      });
    });

    it("refuses an email another Staff member has, in any case", async () => {
      signInAsOwner(preschool);
      const response = await POST(
        jsonRequest({
          centreId: preschool.centreIds[1],
          name: "Copy",
          role: "teacher",
          email: TEACHER.toUpperCase(),
        }),
      );
      expect(response.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(response)).toBe("STAFF_EMAIL_IN_USE");
    });

    it("refuses Classrooms of another Centre or Workspace, or archived ones", async () => {
      signInAsOwner(preschool);
      const base = {
        centreId: preschool.centreId,
        name: "Wrong Room",
        role: "teacher",
      };
      const elsewhere = await POST(
        jsonRequest({ ...base, classroomIds: [branchClassroom] }),
      );
      expect(elsewhere.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(elsewhere)).toBe("CLASSROOM_OTHER_CENTRE");

      const foreign = await addClassroom(other);
      expect(
        (await POST(jsonRequest({ ...base, classroomIds: [foreign] }))).status,
      ).toBe(StatusCodes.NOT_FOUND);

      const archived = await addClassroom(preschool, { name: "Old Room" });
      await prisma.preschoolClassroom.update({
        where: { id: archived },
        data: { archivedAt: new Date() },
      });
      expect(
        (await POST(jsonRequest({ ...base, classroomIds: [archived] }))).status,
      ).toBe(StatusCodes.CONFLICT);
    });

    it("sends a Centre Head's invitation for the Owner, in Preschool words", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const email = uniqueEmail("by-head");
      const { status, body } = await create({
        centreId: preschool.centreId,
        name: "Added By Head",
        role: "teacher",
        email,
      });
      expect(status).toBe(StatusCodes.CREATED);
      expect(body).toMatchObject({
        invitation: "sent",
        staff: { name: "Added By Head" },
      });
      const sent = emailsTo(email);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.text).toContain("a member of staff");
      expect(sent[0]?.text).not.toContain("Batches");
    });

    it("keeps the Staff member when the invitation fails", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      // A Preschool whose identity Workspace was never seeded has no Owner
      // row to send for.
      const orphan = await seedPreschool();
      signInAsOwner(orphan);
      const email = uniqueEmail("orphan");
      const { status, body } = await create({
        centreId: orphan.centreId,
        name: "No Workspace",
        role: "teacher",
        email,
      });
      expect(status).toBe(StatusCodes.CREATED);
      expect(body).toMatchObject({
        invitation: "failed",
        staff: { name: "No Workspace", invitedAt: null },
      });
      expect(emailsTo(email)).toEqual([]);
      expect(consoleError).toHaveBeenCalledWith(
        "Staff invitation failed",
        { staffId: (body as StaffInvitationView).staff.id },
        expect.objectContaining({ code: "WORKSPACE_NOT_FOUND" }),
      );
      consoleError.mockRestore();
      await removePreschool(orphan);
      signInAsOwner(preschool);
    });

    it("answers 403 to a Teacher, a Parent, and another Centre's Head", async () => {
      const body = {
        centreId: preschool.centreId,
        name: "Nobody",
        role: "teacher",
      };
      signInWithEmail(preschool, "teacher", TEACHER);
      expect((await POST(jsonRequest(body))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      signInWithEmail(preschool, "parent", PARENT);
      expect((await POST(jsonRequest(body))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      const response = await POST(jsonRequest(body));
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(response)).toBe("CENTRE_FORBIDDEN");
    });
  });

  describe("GET", () => {
    function listRequest(centreId: string): Request {
      return new Request(
        `http://localhost/api/preschool/staff?centreId=${centreId}`,
      );
    }

    it("lists a Centre's Staff to its managers", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await GET(listRequest(preschool.centreId));
      expect(response.status).toBe(StatusCodes.OK);
      const { items } = (await response.json()) as StaffListView;
      expect(
        items.every((staff) => staff.centreId === preschool.centreId),
      ).toBe(true);
      expect(items.find((staff) => staff.email === TEACHER)).toMatchObject({
        role: "teacher",
        status: "active",
        classrooms: [{ id: nurseryA, name: "Nursery A" }],
      });
    });

    it("answers 403 to a Teacher and CENTRE_FORBIDDEN to another Centre's Head", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      expect((await GET(listRequest(preschool.centreId))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      expect(await codeOf(await GET(listRequest(preschool.centreId)))).toBe(
        "CENTRE_FORBIDDEN",
      );
    });
  });

  describe("details, deactivate, activate", () => {
    it("changes details; a new email clears invitedAt and a helper loses Classrooms", async () => {
      signInAsOwner(preschool);
      const { body } = await create({
        centreId: preschool.centreId,
        name: "Changing",
        role: "teacher",
        email: uniqueEmail("changing"),
        classroomIds: [nurseryB],
      });
      const { id } = (body as StaffInvitationView).staff;
      const newEmail = uniqueEmail("changed");
      const renamed = await details(
        jsonRequest({ name: "Changed", role: "teacher", email: newEmail }),
        idContext(id),
      );
      expect(renamed.status).toBe(StatusCodes.OK);
      expect(await renamed.json()).toMatchObject({
        name: "Changed",
        email: newEmail,
        invitedAt: null,
        phone: null,
        classrooms: [{ id: nurseryB }],
      });
      const helper = await details(
        jsonRequest({ name: "Changed", role: "helper", email: newEmail }),
        idContext(id),
      );
      expect(await helper.json()).toMatchObject({
        role: "helper",
        classrooms: [],
      });
      const clash = await details(
        jsonRequest({ name: "Changed", role: "helper", email: TEACHER }),
        idContext(id),
      );
      expect(clash.status).toBe(StatusCodes.CONFLICT);
    });

    it("leaves Centre Heads to the Owner and other Workspaces' Staff unseen", async () => {
      const otherHead = await addStaff(preschool, {
        role: "centre_head",
        name: "Co-head",
      });
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await details(
        jsonRequest({ name: "Demoted", role: "teacher" }),
        idContext(otherHead),
      );
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(
        (await deactivate(emptyRequest(), idContext(otherHead))).status,
      ).toBe(StatusCodes.FORBIDDEN);

      const foreign = await addStaff(other, { role: "teacher" });
      signInAsOwner(preschool);
      expect(
        (
          await details(
            jsonRequest({ name: "Mine", role: "teacher" }),
            idContext(foreign),
          )
        ).status,
      ).toBe(StatusCodes.NOT_FOUND);
      expect((await invite(emptyRequest(), idContext(foreign))).status).toBe(
        StatusCodes.NOT_FOUND,
      );
    });

    it("deactivates a Teacher, removing their Class Teacher links, and activates again", async () => {
      const id = await addStaff(preschool, {
        role: "teacher",
        name: "Leaving",
        classroomIds: [nurseryB],
      });
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await deactivate(emptyRequest(), idContext(id));
      expect(response.status).toBe(StatusCodes.OK);
      expect(await response.json()).toMatchObject({
        status: "inactive",
        classrooms: [],
      });
      expect(
        await prisma.preschoolClassroomTeacher.count({
          where: { staffId: id },
        }),
      ).toBe(0);
      const back = await activate(emptyRequest(), idContext(id));
      expect(((await back.json()) as StaffView).status).toBe("active");

      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      expect(
        await codeOf(await deactivate(emptyRequest(), idContext(id))),
      ).toBe("CENTRE_FORBIDDEN");
    });
  });

  describe("POST /{id}/invite", () => {
    it("invites again, and says when the email is already a member", async () => {
      signInAsOwner(preschool);
      const email = uniqueEmail("again");
      const id = await addStaff(preschool, { role: "teacher", email });
      const response = await invite(emptyRequest(), idContext(id));
      expect(response.status).toBe(StatusCodes.OK);
      expect(await response.json()).toMatchObject({
        invitation: "sent",
        staff: { id, invitedAt: expect.any(String) as unknown },
      });
      expect(emailsTo(email)).toHaveLength(1);

      const memberEmail = uniqueEmail("member");
      await seedWorkspaceMember({
        workspaceId: preschool.workspaceId,
        userId: `st_member_${randomUUID()}`,
        email: memberEmail,
        role: "teacher",
      });
      const member = await addStaff(preschool, {
        role: "teacher",
        email: memberEmail,
      });
      expect(
        await (await invite(emptyRequest(), idContext(member))).json(),
      ).toMatchObject({ invitation: "already_member" });
    });

    it("refuses a helper, a member with no email, and an inactive member", async () => {
      signInAsOwner(preschool);
      const helper = await addStaff(preschool, {
        role: "helper",
        email: uniqueEmail("h"),
      });
      expect(
        await codeOf(await invite(emptyRequest(), idContext(helper))),
      ).toBe("STAFF_CANNOT_SIGN_IN");
      const noEmail = await addStaff(preschool, { role: "teacher" });
      expect(
        await codeOf(await invite(emptyRequest(), idContext(noEmail))),
      ).toBe("STAFF_EMAIL_REQUIRED");
      const inactive = await addStaff(preschool, {
        role: "teacher",
        email: uniqueEmail("gone"),
      });
      await deactivate(emptyRequest(), idContext(inactive));
      expect(
        await codeOf(await invite(emptyRequest(), idContext(inactive))),
      ).toBe("STAFF_INACTIVE");
    });

    it("answers 403 to a Teacher", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      const id = await addStaff(preschool, { role: "teacher" });
      expect((await invite(emptyRequest(), idContext(id))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
    });
  });
});
