import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AppEmptyPage } from "@/components/app-shell/app-empty-page";
import { AppShell } from "@/components/app-shell/app-shell";
import { APP_NAV } from "@/lib/app-nav";
import { expectAppShell } from "../../.storybook/expect-app-shell";
import { clerkMocks } from "../../.storybook/mocks/clerk";

const meta = {
  title: "Workspace/AppShell",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  beforeEach() {
    clerkMocks.orgId = "org_riverside";
    clerkMocks.memberships = [
      {
        organization: { id: "org_riverside", name: "Riverside Centre" },
      },
    ];
  },
  render: () => (
    <AppShell>
      <AppEmptyPage href="/" />
    </AppShell>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expectAppShell(canvas, canvasElement, userEvent, APP_NAV[0]);
  },
};
