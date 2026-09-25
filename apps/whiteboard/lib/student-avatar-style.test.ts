import { describe, expect, it } from "vitest";

import { studentAvatarColor, studentInitials } from "./student-avatar-style";

describe("studentAvatarColor", () => {
  it("keeps the same color for the same Student ID even after a name change", () => {
    expect(studentAvatarColor("student-123", "Arun Selva Kumar")).toBe(
      studentAvatarColor("student-123", "Arun Kumar"),
    );
  });

  it("uses a normalized name while a Student has no ID", () => {
    expect(studentAvatarColor(undefined, " Arun Selva Kumar ")).toBe(
      studentAvatarColor(undefined, "arun selva kumar"),
    );
  });

  it("shows a neutral placeholder before a name is entered", () => {
    expect(studentAvatarColor(undefined, " ")).toBe(
      "bg-muted text-muted-foreground",
    );
  });
});

describe("studentInitials", () => {
  it("uses the first two words consistently", () => {
    expect(studentInitials(" Arun Selva Kumar ")).toBe("AS");
    expect(studentInitials("Arun")).toBe("A");
  });
});
