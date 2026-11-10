import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { ReportDocumentView } from "./report-document-view";
import {
  emptyDocument,
  monthlyBatchDocument,
  monthlyReviewDocument,
  registerDocument,
  studentAttendanceDocument,
} from "./reports.fixtures";

const meta = {
  title: "Reports/Report document",
  component: ReportDocumentView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="p-4 sm:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReportDocumentView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StudentAttendance: Story = {
  args: { document: studentAttendanceDocument },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", {
        level: 2,
        name: "R1 · Student attendance",
      }),
    ).toBeVisible();
    await expect(canvas.getByText("Riverside Computer Centre")).toBeVisible();
    await expect(
      canvas.getByText("Anita Sharma", { selector: "p" }),
    ).toBeVisible();
    await expect(canvas.getByText("1 Oct 2026 – 31 Oct 2026")).toBeVisible();
    await expect(canvas.getByText("13 Oct 2026, 10:40 AM")).toBeVisible();
    const filters = within(canvas.getByRole("list", { name: "Filters" }));
    await expect(filters.getByText("DCA · DCA Morning")).toBeVisible();

    // Metrics keep the server's text and tone.
    const summary = within(canvas.getByRole("region", { name: "Summary" }));
    await expect(summary.getByText("78%")).toBeVisible();
    await expect(
      summary.getByText("1", { selector: ".text-destructive" }),
    ).toBeVisible();

    const table = within(canvas.getByRole("table", { name: "Classes" }));
    await expect(table.getAllByRole("row")).toHaveLength(10);
    await expect(table.getByText("Absent")).toHaveClass("text-destructive");
    await expect(table.getByText("7 of 9 attended")).toBeVisible();
    await expect(
      canvas.getByText(
        "Late counts as attended. Informed absent and Absent never do.",
      ),
    ).toBeVisible();
  },
};

export const LandscapeRegister: Story = {
  args: { document: registerDocument },
  play: async ({ canvas }) => {
    const table = canvas.getByRole("table", { name: "Register" });
    // Names stay visible while the dates scroll sideways.
    const name = within(table).getByRole("rowheader", { name: "Fatima Begum" });
    await expect(name).toHaveClass("sticky");
    await expect(
      within(table).getByRole("columnheader", { name: "4 Sun" }),
    ).toHaveClass("bg-muted");
    await expect(table.closest('[data-slot="table-container"]')).toHaveClass(
      "overflow-x-auto",
    );
  },
};

export const Empty: Story = {
  args: { document: emptyDocument },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "No dues. Every Enrollment has paid what its Fee Plan asks for so far.",
      ),
    ).toBeVisible();
    await expect(canvas.queryByRole("table")).toBeNull();
    await expect(
      canvas.getByRole("heading", {
        level: 2,
        name: "R9 · Outstanding and overdue dues",
      }),
    ).toBeVisible();
  },
};

export const OneSheetPerStudent: Story = {
  args: { document: monthlyBatchDocument },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { level: 3, name: "Anita Sharma" }),
    ).toBeVisible();
    const second = canvas.getByRole("region", { name: "Priya Nair" });
    await expect(second).toHaveClass("print:break-before-page");
  },
};

export const LinkedMetrics: Story = {
  args: { document: monthlyReviewDocument },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: /Overdue/ })).toHaveAttribute(
      "href",
      "/reports/dues?dueFilter=overdue",
    );
  },
};
