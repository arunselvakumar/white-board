import { describe, expect, it } from "vitest";

import { workspaceEntryPath } from "./workspace-entry";

describe("workspaceEntryPath", () => {
  it("sends a normal sign-in through Workspace selection", () => {
    expect(workspaceEntryPath("/")).toBe("/select-workspace");
  });

  it("preserves a requested app page for after selection", () => {
    expect(workspaceEntryPath("/students/new?source=invite")).toBe(
      "/select-workspace?redirect_url=%2Fstudents%2Fnew%3Fsource%3Dinvite",
    );
  });

  it("removes the public app base path from Clerk return URLs", () => {
    expect(workspaceEntryPath("https://white-board-v3.vercel.app/app")).toBe(
      "/select-workspace",
    );
    expect(workspaceEntryPath("/app/students/new?source=invite")).toBe(
      "/select-workspace?redirect_url=%2Fstudents%2Fnew%3Fsource%3Dinvite",
    );
  });

  it("does not return to an authentication page", () => {
    expect(workspaceEntryPath("/login")).toBe("/select-workspace");
    expect(workspaceEntryPath("/app/login")).toBe("/select-workspace");
  });
});
