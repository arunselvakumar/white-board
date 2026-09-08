import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { Button } from "@repo/ui/components/button";

import { AuthHeader } from "@/components/auth-header";
import { QueryStatus } from "@/components/query-status";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const meta = {
  title: "Pages/In-app Home",
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <WorkspaceGate>
      <div className="flex min-h-svh flex-col">
        <AuthHeader />
        <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
          <div className="flex max-w-md flex-col gap-3 text-center">
            <p className="text-muted-foreground text-sm font-light tracking-wide uppercase">
              Riverside School
            </p>
            <h1 className="text-3xl tracking-tight">Whiteboard</h1>
            <p className="text-muted-foreground text-sm leading-relaxed font-light">
              You&apos;re in this workspace. Shared UI comes from{" "}
              <code className="font-mono text-xs">@repo/ui</code>.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button>Open board</Button>
            <QueryStatus />
          </div>
        </main>
      </div>
    </WorkspaceGate>
  ),
  beforeEach() {
    clerkMocks.orgId = "org_riverside";
    clerkMocks.memberships = [
      { organization: { id: "org_riverside", name: "Riverside School" } },
    ];
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Whiteboard" }),
    ).toBeVisible();
    await expect(canvas.getByText("Riverside School")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Open board" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Open user menu" }),
    ).toBeVisible();
  },
};
