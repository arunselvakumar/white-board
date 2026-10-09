import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { authMocks, signInAs } from "../../.storybook/mocks/auth";
import { ChooseCompanyForm } from "./choose-company-form";
import { OnboardingShell } from "./onboarding-shell";

const meta = {
  title: "Onboarding/ChooseCompanyForm",
  component: ChooseCompanyForm,
  args: { redirectUrl: null },
  render: (args) => (
    <OnboardingShell>
      <ChooseCompanyForm {...args} />
    </OnboardingShell>
  ),
} satisfies Meta<typeof ChooseCompanyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SeveralCompanies: Story = {
  args: { redirectUrl: "/app/masters" },
  beforeEach() {
    signInAs("owner");
    authMocks.workspaceId = null;
    authMocks.companies = [
      { id: "company_anugraha", name: "Anugraha Engineers", role: "owner" },
      { id: "company_sri", name: "Sri Infra", role: "member" },
    ];
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Choose a Company" }),
    ).toBeVisible();
    await expect(canvas.getByText("Team Member")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Sri Infra" }),
    );
    await waitFor(() =>
      expect(authMocks.setActive).toHaveBeenCalledWith(
        "company_sri",
        "/app/masters",
      ),
    );
  },
};

export const NoCompanies: Story = {
  beforeEach() {
    signInAs("owner");
    authMocks.workspaceId = null;
    authMocks.companies = [];
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Get started" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Create a Company" }),
    ).toHaveAttribute("href", "/create-company");
  },
};
