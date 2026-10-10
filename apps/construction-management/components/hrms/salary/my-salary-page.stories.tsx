import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { MySalaryPage } from "./my-salary-page";
import { ME, serveSalary, storySlip } from "./salary-story-support";

const OCTOBER = storySlip({
  id: "0199c6b2-0000-7000-8000-000000000001",
  memberId: ME,
  memberName: "Arun Selva Kumar",
  own: true,
  status: "paid",
  hasPayslip: true,
  payment: { mode: "bank", date: "2026-11-01", reference: "NEFT 42" },
});
const SEPTEMBER = storySlip({
  id: "0199c6b2-0000-7000-8000-000000000002",
  memberId: ME,
  memberName: "Arun Selva Kumar",
  own: true,
  month: "2026-09",
  status: "approved",
  hasPayslip: true,
});

function serve(items = [OCTOBER, SEPTEMBER]) {
  return () =>
    serveSalary({
      mine: {
        member: {
          memberId: ME,
          name: "Arun Selva Kumar",
          designationName: "Project Manager",
        },
        items,
      },
    }).restore;
}

const meta = {
  title: "HRMS/Salary/My Salary",
  component: MySalaryPage,
  render: () => (
    <StoryQueries>
      <MySalaryPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof MySalaryPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListsMySalaries: Story = {
  beforeEach: serve(),
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", { name: "My salaries" });
    await expect(within(list).getByText("October 2026")).toBeVisible();
    await expect(within(list).getAllByText("₹26,000.00")).toHaveLength(2);
    await expect(
      within(list).getByRole("link", {
        name: "Download payslip for September 2026",
      }),
    ).toHaveAttribute(
      "href",
      `/api/construction/hrms/salaries/${SEPTEMBER.id}/payslip`,
    );
  },
};

export const OpensThePayslip: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Salary for October 2026" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Salary Slip" });
    await expect(within(sheet).getByText("Advance Recovered")).toBeVisible();
    await expect(
      within(sheet).getByText("Paid by Bank on 1 Nov 2026 · NEFT 42"),
    ).toBeVisible();
    await expect(
      within(sheet).getByRole("link", { name: "View payslip" }),
    ).toHaveAttribute(
      "href",
      `/api/construction/hrms/salaries/${OCTOBER.id}/payslip?inline=1`,
    );
  },
};

export const NoSlipsYet: Story = {
  beforeEach: serve([]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No salary slips yet")).toBeVisible();
  },
};
