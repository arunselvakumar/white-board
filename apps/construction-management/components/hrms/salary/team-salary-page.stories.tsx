import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  PRIYA,
  serveSalary,
  STORY_SLIPS,
  storyTeam,
  withoutAmounts,
  type SalaryApiState,
} from "./salary-story-support";
import { TeamSalaryPage } from "./team-salary-page";

let api: ReturnType<typeof serveSalary>;

function serve(state: SalaryApiState = {}) {
  return () => {
    api = serveSalary(state);
    return api.restore;
  };
}

function posted(path: string) {
  return api.calls.find(
    (call) => call.method === "POST" && call.path.endsWith(path),
  );
}

const meta = {
  title: "HRMS/Salary/Team Salary",
  component: TeamSalaryPage,
  render: () => (
    <StoryQueries>
      <TeamSalaryPage today="2026-11-10" />
    </StoryQueries>
  ),
} satisfies Meta<typeof TeamSalaryPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ListsTheMonth: Story = {
  beforeEach: serve(),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("October 2026")).toBeVisible();
    const totals = await canvas.findByLabelText("Month totals");
    await expect(within(totals).getByText("₹78,000.00")).toBeVisible();
    const salaries = canvas.getByRole("region", { name: "Salaries" });
    await expect(within(salaries).getByText("Priya Raman")).toBeVisible();
    await expect(within(salaries).getByText("Calculated")).toBeVisible();
    await expect(within(salaries).getByText("Paid")).toBeVisible();
    const advances = canvas.getByRole("region", { name: "Advances paid" });
    await expect(within(advances).getByText("₹9,000.00")).toBeVisible();
    const skipped = canvas.getByRole("region", { name: "Not calculated" });
    await expect(
      within(skipped).getByText("Salary not set in Employee Management."),
    ).toBeVisible();
  },
};

export const CalculatesTheMonth: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Calculate Salary" }),
    );
    await expect(
      await canvas.findByText("Calculated 2 salaries, kept 1 approved."),
    ).toBeVisible();
    await expect(posted("/calculate-bulk")?.body).toEqual({
      month: "2026-10",
      memberIds: null,
    });
  },
};

export const ApprovesTheSelected: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    const approve = await canvas.findByRole("button", { name: "Approve (0)" });
    await expect(approve).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select Priya Raman" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Approve (1)" }));
    await expect(
      await canvas.findByText(/Approved 1 salary\. Its month is now closed/),
    ).toBeVisible();
    await expect(posted("/approve")?.body).toEqual({
      slips: [
        {
          id: STORY_SLIPS[0]?.id,
          expectedUpdatedAt: STORY_SLIPS[0]?.updatedAt,
        },
      ],
    });
  },
};

export const ShowsWhyApprovalWasRefused: Story = {
  beforeEach: serve({
    write: (call) =>
      call.path.endsWith("/approve")
        ? Response.json(
            {
              code: "SALARY_OWN_SLIP",
              message:
                "You cannot approve your own salary. Another approver must.",
            },
            { status: 403 },
          )
        : undefined,
  }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: "Select all" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Approve (1)" }));
    await expect(
      await canvas.findByText(
        "You cannot approve your own salary. Another approver must.",
      ),
    ).toBeVisible();
  },
};

export const MarksApprovedSalariesPaid: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: "Select Ravi Kumar" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Mark Paid (1)" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Mark Salaries as Paid",
    });
    await userEvent.type(
      within(dialog).getByLabelText("Reference (optional)"),
      "UTR 991",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Mark as Paid" }),
    );
    await expect(
      await canvas.findByText("Marked 1 salary as paid."),
    ).toBeVisible();
    await expect(posted("/mark-paid")?.body).toEqual({
      slips: [
        {
          id: STORY_SLIPS[1]?.id,
          expectedUpdatedAt: STORY_SLIPS[1]?.updatedAt,
        },
      ],
      mode: "bank",
      paymentDate: "2026-11-10",
      reference: "UTR 991",
    });
  },
};

export const PaysAnAdvance: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Pay Advance" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Pay Advance Salary",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Pay Advance" }),
    );
    await expect(
      await within(dialog).findByText("Choose a Team Member"),
    ).toBeVisible();
    await expect(
      within(dialog).getByText("Enter an amount above ₹0"),
    ).toBeVisible();
    await userEvent.click(within(dialog).getByLabelText("Team Member"));
    await userEvent.click(
      await screen.findByRole("option", {
        name: "Priya Raman · Site Engineer",
      }),
    );
    await userEvent.type(within(dialog).getByLabelText("Amount"), "9000");
    const instalments = within(dialog).getByLabelText("Instalments");
    await userEvent.clear(instalments);
    await userEvent.type(instalments, "3");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Pay Advance" }),
    );
    await expect(
      await canvas.findByText("Advance of ₹9000 paid to Priya Raman."),
    ).toBeVisible();
    await expect(posted("/calculate-advance")?.body).toEqual({
      memberId: PRIYA,
      amount: 900_000,
      instalments: 3,
      advanceDate: "2026-11-10",
      mode: "cash",
      reference: null,
      reason: null,
    });
  },
};

export const OpensASlip: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: /^Priya Raman, calculated/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Salary Slip" });
    await expect(within(sheet).getByText("₹26,000.00")).toBeVisible();
    await expect(
      within(sheet).getByText(
        "The payslip is ready once this salary is approved.",
      ),
    ).toBeVisible();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Recalculate" }),
    );
    await waitFor(() => expect(posted("/recalculate")).toBeDefined());
  },
};

export const OpensAnApprovedSlipWithItsPayslip: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: /^Ravi Kumar, approved/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Salary Slip" });
    await expect(
      within(sheet).getByRole("link", { name: "Download PDF" }),
    ).toHaveAttribute(
      "href",
      `/api/construction/hrms/salaries/${STORY_SLIPS[1]?.id ?? ""}/payslip`,
    );
    await expect(
      within(sheet).queryByRole("button", { name: "Recalculate" }),
    ).toBeNull();
  },
};

export const HidesAmountsWithoutFinancial: Story = {
  beforeEach: serve({
    team: storyTeam({
      items: withoutAmounts(STORY_SLIPS),
      totals: null,
      can: {
        calculate: false,
        approve: false,
        markPaid: false,
        payAdvance: false,
        report: false,
        financial: false,
        viewAll: true,
      },
    }),
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("region", { name: "Salaries" }),
    ).toBeVisible();
    await expect(canvas.queryByLabelText("Month totals")).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Calculate Salary" }),
    ).toBeNull();
    await expect(
      canvas.getByRole("button", { name: /^Priya Raman, calculated, net —/ }),
    ).toBeVisible();
  },
};

export const EmptyMonth: Story = {
  beforeEach: serve({
    team: storyTeam({ items: [], skipped: [], totals: null }),
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No salaries for October 2026"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Calculate Salary" }),
    ).toBeVisible();
  },
};

export const NotShared: Story = {
  beforeEach: serve({ team: null }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Team salary is not shared with you"),
    ).toBeVisible();
  },
};
