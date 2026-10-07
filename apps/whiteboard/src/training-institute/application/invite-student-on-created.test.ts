import { describe, expect, it, vi } from "vitest";

import { InviteStudentOnCreated } from "./invite-student-on-created";

const event = {
  type: "StudentCreated" as const,
  studentId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "org_1",
  occurredAt: new Date(),
};

describe("StudentCreated invitation listener", () => {
  it("sends Student and family invitations after loading the new Student", async () => {
    const sent: {
      emailAddress: string;
      role: string;
      workspaceId: string;
      inviterUserId: string;
    }[] = [];
    const listener = new InviteStudentOnCreated(
      () =>
        Promise.resolve({
          email: "student@example.com",
          details: {
            father: { email: "parent@example.com" },
            mother: { email: "PARENT@example.com" },
            guardians: [{ email: "guardian@example.com" }],
          },
          createdByUserId: "user_owner",
        }),
      {
        send: (input) => {
          sent.push(input);
          return Promise.resolve();
        },
      },
    );

    await listener.handle(event);

    expect(sent).toEqual([
      {
        workspaceId: "org_1",
        inviterUserId: "user_owner",
        emailAddress: "student@example.com",
        role: "student",
      },
      {
        workspaceId: "org_1",
        inviterUserId: "user_owner",
        emailAddress: "parent@example.com",
        role: "parent",
      },
      {
        workspaceId: "org_1",
        inviterUserId: "user_owner",
        emailAddress: "guardian@example.com",
        role: "parent",
      },
    ]);
  });

  it("continues to other recipients if one invitation fails", async () => {
    const attempted: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const listener = new InviteStudentOnCreated(
      () =>
        Promise.resolve({
          email: "student@example.com",
          details: {
            father: { email: "parent@example.com" },
            mother: { email: null },
            guardians: [],
          },
          createdByUserId: "user_owner",
        }),
      {
        send: ({ emailAddress }) => {
          attempted.push(emailAddress);
          if (emailAddress === "student@example.com")
            return Promise.reject(new Error("Email unavailable"));
          return Promise.resolve();
        },
      },
    );

    await listener.handle(event);
    expect(attempted).toEqual(["student@example.com", "parent@example.com"]);
    log.mockRestore();
  });
});
