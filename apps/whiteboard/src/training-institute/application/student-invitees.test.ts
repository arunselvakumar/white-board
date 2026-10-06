import { describe, expect, it } from "vitest";

import { studentInvitees } from "./student-invitees";

describe("Student invitation recipients", () => {
  it("invites the Student and every distinct family email with the correct role", () => {
    expect(
      studentInvitees({
        email: " Learner@Example.com ",
        details: {
          father: { email: "family@example.com" },
          mother: { email: "FAMILY@example.com" },
          guardians: [{ email: "grandparent@example.com" }, { email: null }],
        },
      }),
    ).toEqual([
      { emailAddress: "learner@example.com", role: "org:student" },
      { emailAddress: "family@example.com", role: "org:parent" },
      { emailAddress: "grandparent@example.com", role: "org:parent" },
    ]);
  });

  it("skips empty emails and never invites one address with two roles", () => {
    expect(
      studentInvitees({
        email: null,
        details: {
          father: { email: " " },
          mother: { email: "parent@example.com" },
          guardians: [{ email: "PARENT@example.com" }],
        },
      }),
    ).toEqual([{ emailAddress: "parent@example.com", role: "org:parent" }]);
  });
});
