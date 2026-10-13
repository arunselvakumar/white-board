import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import {
  callsTo,
  hasNoHorizontalOverflow,
  mockApi,
  withFreshQueryClient,
} from "@/components/notifications/story-api";
import type { ReportParams } from "@/src/queries/reports";
import type {
  ReportKey,
  ReportRole,
} from "@/src/training-institute/domain/report-catalogue";
import { signInAs } from "../../.storybook/mocks/auth";

import { ReportContent } from "./report-screen";
import { ReportsCatalogue } from "./reports-catalogue";
import {
  ANITA,
  DCA_MORNING,
  catalogueFor,
  catalogueItem,
  emptyDocument,
  registerDocument,
  reportOptions,
  studentAttendanceDocument,
} from "./reports.fixtures";

/** The report screen with its filters in state, as the URL keeps them in the app. */
function Harness({
  reportKey,
  role,
  initial = {},
}: {
  reportKey: ReportKey;
  role: ReportRole;
  initial?: ReportParams;
}) {
  const [params, setParams] = useState<ReportParams>(initial);
  return (
    <AppShell>
      <ReportContent
        item={catalogueItem(reportKey, role)}
        options={{ ...reportOptions, role }}
        role={role}
        params={params}
        onParamsChange={setParams}
      />
    </AppShell>
  );
}

const feeStatementDocument = {
  ...studentAttendanceDocument,
  report: "fee-statement" as const,
  code: "R11",
  title: "Student fee statement",
};

const meta = {
  title: "Reports/Report screen",
  decorators: [withFreshQueryClient],
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/reports/student-attendance" } },
  },
  beforeEach() {
    signInAs("owner");
    return mockApi({
      "GET /reports/student-attendance": () => ({
        json: studentAttendanceDocument,
      }),
      "GET /reports/attendance-register": () => ({ json: registerDocument }),
      "GET /reports/dues": () => ({ json: emptyDocument }),
      "GET /reports/fee-statement": () => ({ json: feeStatementDocument }),
      "POST /reports/fee-statement/email": () => ({
        json: {
          sent: [{ studentName: "Anita Sharma", email: "ramesh@example.com" }],
          notSent: [{ studentName: "Rahul Verma", reason: "no email" }],
        },
      }),
    });
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Catalogue: Story = {
  parameters: { nextjs: { navigation: { pathname: "/reports" } } },
  render: () => (
    <AppShell>
      <ReportsCatalogue catalogue={catalogueFor("owner")} />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Reports" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /Report settings/ }),
    ).toHaveAttribute("href", "/reports/settings");
    const fees = within(canvas.getByRole("region", { name: "Fees" }));
    await expect(
      fees.getByRole("link", { name: /R9 Outstanding and overdue dues/ }),
    ).toHaveAttribute("href", "/reports/dues");
    await expect(hasNoHorizontalOverflow(canvasElement)).toBe(true);
  },
};

export const ParentCatalogue: Story = {
  parameters: { nextjs: { navigation: { pathname: "/reports" } } },
  beforeEach() {
    signInAs("parent");
  },
  render: () => (
    <AppShell>
      <ReportsCatalogue catalogue={catalogueFor("parent")} />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("link", { name: /Report settings/ }),
    ).toBeNull();
    await expect(canvas.getByRole("region", { name: "Fees" })).toBeVisible();
    await expect(canvas.queryByText("Receipts register")).toBeNull();
  },
};

export const ChooseAStudentFirst: Story = {
  render: () => <Harness reportKey="student-attendance" role="owner" />,
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByText(
        "This report is about one Student. Pick one above.",
      ),
    ).toBeVisible();
    await expect(callsTo("GET /reports/student-attendance")).toHaveLength(0);
    // No actions until there is a report to act on.
    await expect(canvas.queryByRole("button", { name: "Print" })).toBeNull();

    await userEvent.click(canvas.getByLabelText("Student"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Anita Sharma",
      }),
    );
    await expect(
      await canvas.findByRole("heading", {
        level: 2,
        name: "R1 · Student attendance",
      }),
    ).toBeVisible();
    const call = callsTo("GET /reports/student-attendance").at(-1);
    await expect(call?.url.searchParams.get("studentId")).toBe(ANITA);
    // The server picks the period: nothing the Owner didn't choose is sent.
    await expect(call?.url.searchParams.has("period")).toBe(false);

    await expect(
      canvas.getByRole("link", { name: "Download Excel" }),
    ).toHaveAttribute(
      "href",
      `/api/training-institute/reports/student-attendance/download?format=xlsx&studentId=${ANITA}`,
    );
    await expect(canvas.getByRole("button", { name: "Print" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Email to me" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Email to parents" }),
    ).toBeNull();
  },
};

export const EmptyReport: Story = {
  parameters: { nextjs: { navigation: { pathname: "/reports/dues" } } },
  render: () => <Harness reportKey="dues" role="owner" />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "No dues. Every Enrollment has paid what its Fee Plan asks for so far.",
      ),
    ).toBeVisible();
    await expect(canvas.queryByRole("table")).toBeNull();
    // The flag shows the server's default from the report on screen.
    await waitFor(async () => {
      await expect(
        canvas.getByRole("switch", { name: "Include ended Enrollments" }),
      ).toBeChecked();
    });
  },
};

export const LandscapeRegister: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/reports/attendance-register" } },
  },
  render: () => (
    <Harness
      reportKey="attendance-register"
      role="teacher"
      initial={{ batchId: DCA_MORNING }}
    />
  ),
  beforeEach() {
    signInAs("teacher");
    return mockApi({
      "GET /reports/attendance-register": () => ({ json: registerDocument }),
      "GET /notifications/unread-count": () => ({ json: { unreadCount: 0 } }),
    });
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("table", { name: "Register" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Download Excel" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Email to me" }),
    ).toBeNull();
    await expect(hasNoHorizontalOverflow(canvasElement)).toBe(true);
  },
};

export const EmailToParents: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/reports/fee-statement" } },
  },
  render: () => (
    <Harness
      reportKey="fee-statement"
      role="owner"
      initial={{ studentId: ANITA }}
    />
  ),
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Email to parents" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await expect(
      dialog.getByText("Email this report to parents?"),
    ).toBeVisible();
    await expect(callsTo("POST /reports/fee-statement/email")).toHaveLength(0);

    await userEvent.click(dialog.getByRole("button", { name: "Send" }));
    await expect(
      await dialog.findByText("Report emailed to parents"),
    ).toBeVisible();
    await expect(callsTo("POST /reports/fee-statement/email")[0]?.body).toEqual(
      {
        to: "parents",
        confirmed: true,
        query: { studentId: ANITA },
      },
    );
    await expect(dialog.getByText(/sent to ramesh@example.com/)).toBeVisible();
    await expect(dialog.getByText("not sent: no email")).toBeVisible();
  },
};
