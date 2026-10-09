import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import type { ProjectResponse } from "@/src/queries/projects";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { ANUGRAHA, project } from "./project-fixtures";
import { setProjectFlash } from "./project-flash";
import { ProjectOverview } from "./project-overview";

const BASE = "/api/construction/projects/projects";

function serve(subject: ProjectResponse) {
  return () =>
    mockApi((call) =>
      call.method === "GET" && call.path === `${BASE}/${subject.id}`
        ? Response.json(subject)
        : undefined,
    ).restore;
}

const meta = {
  title: "Projects/ProjectOverview",
  component: ProjectOverview,
  args: { id: ANUGRAHA.id },
  beforeEach: serve(ANUGRAHA),
  render: (args) => (
    <StoryQueries>
      <ProjectOverview {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ContractAndAdditionalDetails: Story = {
  play: async ({ canvas }) => {
    const contract = within(
      await canvas.findByRole("region", { name: "Contract" }),
    );
    await expect(contract.getByText("Sri Balaji Developers")).toBeVisible();
    await expect(contract.getByText("+91 98431 22110")).toBeVisible();
    await expect(contract.getByText("₹1,84,50,000 excl. GST")).toBeVisible();
    await expect(contract.getByText("SBD/Q/2026/114")).toBeVisible();
    await expect(contract.getByText("12 Feb 2026")).toBeVisible();
    await expect(contract.getByText("WO/2026/031")).toBeVisible();
    // Only what is filled in: no LOA, Agreement or Tender ref. here.
    await expect(contract.queryByText("LOA")).toBeNull();
    await expect(contract.queryByText("Agreement")).toBeNull();

    const more = within(
      canvas.getByRole("region", { name: "Additional details" }),
    );
    await expect(more.getByText("Site engineer")).toBeVisible();
    await expect(more.getByText("Prabhu Saravanan")).toBeVisible();
  },
};

export const WithoutFinancialHidesOrderValue: Story = {
  beforeEach: serve({ ...ANUGRAHA, orderValue: null }),
  play: async ({ canvas }) => {
    const contract = within(
      await canvas.findByRole("region", { name: "Contract" }),
    );
    await expect(contract.getByText("SBD/Q/2026/114")).toBeVisible();
    await expect(contract.queryByText("Order value")).toBeNull();
  },
};

const PLAIN = project({ id: ANUGRAHA.id, name: "Anugraha Residency" });

export const NothingFilledHidesTheCards: Story = {
  beforeEach: serve(PLAIN),
  play: async ({ canvas }) => {
    await canvas.findByRole("region", { name: "Details" });
    await expect(canvas.queryByRole("region", { name: "Contract" })).toBeNull();
    await expect(
      canvas.queryByRole("region", { name: "Additional details" }),
    ).toBeNull();
  },
};

export const FailedUploadsAfterAdd: Story = {
  beforeEach: () => {
    setProjectFlash(
      ANUGRAHA.id,
      "2 files couldn't upload. Add them again from Documents.",
    );
    return serve(ANUGRAHA)();
  },
  play: async ({ canvas, userEvent }) => {
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(
      "2 files couldn't upload. Add them again from Documents.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};
