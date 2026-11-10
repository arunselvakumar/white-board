import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { CompanySetupLoader } from "./company-setup-loader";
import { OnboardingSplitShell } from "./onboarding-shell";

const meta = {
  title: "Onboarding/CompanySetupLoader",
  component: CompanySetupLoader,
  parameters: { layout: "fullscreen" },
  args: { onPlayed: fn() },
  render: (args) => (
    <OnboardingSplitShell>
      <p>The Create Company wizard sits behind the loader.</p>
      <CompanySetupLoader {...args} />
    </OnboardingSplitShell>
  ),
} satisfies Meta<typeof CompanySetupLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** At the pace a new Owner sees it. */
export const Default: Story = {};

export const PlaysEveryStepOnce: Story = {
  args: { stepMs: 20 },
  play: async ({ args, canvasElement }) => {
    const status = within(canvasElement.ownerDocument.body).getByRole("status");
    await waitFor(() => expect(args.onPlayed).toHaveBeenCalledOnce());
    // It stays on the last step until the page leaves.
    await expect(status).toHaveTextContent("Getting your Projects ready");
    // No close button: the Owner waits for the app to open.
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("button", {
        name: /close/i,
      }),
    ).toBeNull();
  },
};
