import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, fn, waitFor, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
  type PreschoolApiCall,
  type PreschoolApiHandler,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type { ClassroomListView } from "@/src/preschool/application/classroom-views";
import type {
  DuesRowView,
  FeePaymentListView,
  FeeSummaryView,
} from "@/src/preschool/application/fee-views";

import { DuesTable } from "./dues-table";
import { FeesDeskScreen } from "./fees-desk-screen";

const NURSERY = "6a0e8400-e29b-41d4-a716-446655440001";
const LKG = "6a0e8400-e29b-41d4-a716-446655440002";
const AARAV = "7a0e8400-e29b-41d4-a716-446655440001";
const DIYA = "7a0e8400-e29b-41d4-a716-446655440002";
const PAYMENT = "8a0e8400-e29b-41d4-a716-446655440001";

const AARAV_ROW: DuesRowView = {
  childId: AARAV,
  firstName: "Aarav",
  lastName: "Kumar",
  admissionNumber: "LSAN-0007",
  classroom: { id: NURSERY, name: "Nursery A" },
  fatherName: "Ravi Kumar",
  fatherPhone: "044 2345 6789",
  motherName: "Meena Kumar",
  motherPhone: "98765 43210",
  duePaise: 4_100_000,
  overduePaise: 2_900_000,
  oldestDueOn: "2026-06-01",
  invoiceCount: 4,
};

const DIYA_ROW: DuesRowView = {
  childId: DIYA,
  firstName: "Diya",
  lastName: null,
  admissionNumber: "LSAN-0012",
  classroom: { id: LKG, name: "LKG A" },
  fatherName: "Suresh",
  fatherPhone: null,
  motherName: null,
  motherPhone: null,
  duePaise: 1_200_000,
  overduePaise: 0,
  oldestDueOn: "2026-12-01",
  invoiceCount: 1,
};

const SUMMARY: FeeSummaryView = {
  collectedTodayPaise: 1_250_000,
  collectedThisMonthPaise: 18_500_000,
  duePaise: 5_300_000,
  overduePaise: 2_900_000,
  childrenWithDues: 2,
};

const CLASSROOMS: ClassroomListView = {
  academicYear: { id: "5c0e8400-e29b-41d4-a716-446655440000", name: "2026–27" },
  items: [NURSERY, LKG].map((id, index) => ({
    id,
    centreId: CENTRE_IDS.annaNagar,
    academicYearId: "5c0e8400-e29b-41d4-a716-446655440000",
    programmeId: "9a0e8400-e29b-41d4-a716-446655440001",
    programmeName: index === 0 ? "Nursery (Pre-KG)" : "LKG",
    name: index === 0 ? "Nursery A" : "LKG A",
    capacity: 20,
    childCount: 12,
    seatsLeft: 8,
    isArchived: false,
    teachers: [],
  })),
};

const PAYMENTS: FeePaymentListView = {
  items: [
    {
      id: PAYMENT,
      receiptNumber: "LSAN/2026-27/00042",
      receivedOn: "2026-11-25",
      amountPaise: 1_250_000,
      method: "upi",
      reference: "UPI-881234",
      childId: AARAV,
      childName: "Aarav Kumar",
      admissionNumber: "LSAN-0007",
      recordedByName: "Arun",
    },
  ],
  nextCursor: null,
  total: 1,
  totalPaise: 1_250_000,
};

function deskRoutes(
  dues: readonly DuesRowView[],
  extra: Record<string, PreschoolApiHandler> = {},
): Record<string, PreschoolApiHandler> {
  return {
    "GET /fees/summary": () => ({ json: SUMMARY }),
    "GET /classrooms": () => ({ json: CLASSROOMS }),
    "GET /fees/dues": () => ({ json: { items: dues } }),
    "GET /fees/payments": () => ({ json: PAYMENTS }),
    ...extra,
  };
}

const calls: PreschoolApiCall[] = [];
const requests: string[] = [];
const onCollect = fn();

const meta = {
  title: "Preschool/Fees/Desk",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/fees" } },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DuesEmpty: Story = {
  beforeEach() {
    return mockPreschoolApi();
  },
  render: () => (
    <DuesTable rows={[]} centreName="Little Steps" onCollect={onCollect} />
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Nobody owes anything")).toBeVisible();
  },
};

export const DuesFilled: Story = {
  beforeEach() {
    onCollect.mockClear();
    return mockPreschoolApi();
  },
  render: () => (
    <DuesTable
      rows={[AARAV_ROW, DIYA_ROW]}
      centreName="Little Steps Anna Nagar"
      onCollect={onCollect}
    />
  ),
  play: async ({ canvas, userEvent }) => {
    const aarav = within(
      (await canvas.findByRole("link", { name: "Aarav Kumar" })).closest(
        "tr",
      ) as HTMLElement,
    );
    await expect(aarav.getByText("₹29,000")).toHaveClass("text-destructive");
    await expect(aarav.getByText("Meena Kumar")).toBeVisible();
    const remind = aarav.getByRole("link", {
      name: "Remind Aarav Kumar's family on WhatsApp",
    });
    await expect(remind).toHaveAttribute("target", "_blank");
    const href = new URL(remind.getAttribute("href") ?? "");
    await expect(href.pathname).toBe("/919876543210");
    await expect(href.searchParams.get("text")).toContain("₹29,000");
    await expect(
      canvas.getByRole("link", { name: "Aarav Kumar" }),
    ).toHaveAttribute("href", `/preschool/fees/children/${AARAV}`);

    const diya = within(
      canvas.getByRole("link", { name: "Diya" }).closest("tr") as HTMLElement,
    );
    await expect(
      diya.getByRole("button", { name: /Remind on WhatsApp/ }),
    ).toBeDisabled();
    await expect(diya.getByText("No mobile number")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Collect from Aarav Kumar" }),
    );
    await expect(onCollect).toHaveBeenCalledWith({
      childId: AARAV,
      childName: "Aarav Kumar",
      duePaise: 4_100_000,
      overduePaise: 2_900_000,
    });
  },
};

export const Desk: Story = {
  beforeEach() {
    return mockPreschoolApi({ routes: deskRoutes([AARAV_ROW, DIYA_ROW]) });
  },
  render: () => <FeesDeskScreen />,
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Fees" }),
    ).toBeVisible();
    await expect(await canvas.findByText("₹12,500")).toBeVisible();
    await expect(canvas.getByText("₹1,85,000")).toBeVisible();
    await expect(
      await canvas.findByRole("link", { name: "Aarav Kumar" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("switch", { name: "Overdue only" }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "Payments" }));
    const receipt = await canvas.findByRole("link", {
      name: "LSAN/2026-27/00042",
    });
    await expect(receipt).toHaveAttribute(
      "href",
      `/preschool/fees/receipts/${PAYMENT}`,
    );
    await expect(canvas.getByText("1 payment in these dates")).toBeVisible();
  },
};

export const CollectPayment: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      routes: deskRoutes([AARAV_ROW], {
        "POST /fees/payments": () => ({
          status: 201,
          json: { id: PAYMENT },
        }),
      }),
    });
  },
  render: () => <FeesDeskScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Collect from Aarav Kumar" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    const amount = dialog.getByLabelText("Amount (₹)");
    await expect(amount).toHaveValue("29000");
    await userEvent.click(dialog.getByRole("button", { name: "Pay all dues" }));
    await expect(amount).toHaveValue("41000");
    await expect(dialog.queryByLabelText("UPI reference")).toBeNull();
    await userEvent.click(dialog.getByLabelText("Method"));
    await userEvent.click(await body.findByRole("option", { name: "UPI" }));
    await userEvent.type(
      await dialog.findByLabelText("UPI reference"),
      "UPI-881234",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Record payment" }),
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/preschool/fees/receipts/${PAYMENT}`,
      ),
    );
    await expect(
      calls.find((call) => call.route === "POST /fees/payments")?.body,
    ).toMatchObject({
      childId: AARAV,
      amountPaise: 4_100_000,
      method: "upi",
      reference: "UPI-881234",
      note: null,
    });
  },
};

export const CollectMoreThanOwed: Story = {
  beforeEach() {
    return mockPreschoolApi({
      routes: deskRoutes([AARAV_ROW], {
        "POST /fees/payments": () => ({
          status: 409,
          json: {
            code: "FEE_OVERPAY",
            message: "The amount is more than this Child owes.",
            details: { owedPaise: 4_100_000 },
          },
        }),
      }),
    });
  },
  render: () => <FeesDeskScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Collect from Aarav Kumar" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    const amount = dialog.getByLabelText("Amount (₹)");
    await userEvent.clear(amount);
    await userEvent.type(amount, "50000");
    await userEvent.click(
      dialog.getByRole("button", { name: "Record payment" }),
    );
    await expect(
      await dialog.findByText("More than Aarav Kumar owes: ₹41,000"),
    ).toBeVisible();
    await expect(amount).toHaveAttribute("aria-invalid", "true");
  },
};

export const CollectValidation: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({ calls, routes: deskRoutes([AARAV_ROW]) });
  },
  render: () => <FeesDeskScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Collect from Aarav Kumar" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.clear(dialog.getByLabelText("Amount (₹)"));
    await userEvent.type(dialog.getByLabelText("Amount (₹)"), "12.345");
    const date = dialog.getByLabelText("Date received");
    await userEvent.clear(date);
    await userEvent.type(date, "2999-01-01");
    await userEvent.click(
      dialog.getByRole("button", { name: "Record payment" }),
    );
    await expect(
      await dialog.findByText(
        "Enter an amount in rupees, up to 2 decimal places",
      ),
    ).toBeVisible();
    await expect(
      dialog.getByText("The date received cannot be in the future"),
    ).toBeVisible();
    await expect(
      calls.filter((call) => call.route === "POST /fees/payments"),
    ).toEqual([]);
  },
};

export const TeacherSeesNoFees: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/attendance" } },
  },
  beforeEach() {
    requests.length = 0;
    return mockPreschoolApi({
      me: preschoolMe({ role: "teacher", classroomIds: [NURSERY] }),
      requests,
      routes: deskRoutes([AARAV_ROW]),
    });
  },
  render: () => <FeesDeskScreen />,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Not available to you")).toBeVisible();
    await expect(
      requests.filter((path) => path.startsWith("/api/preschool/fees")),
    ).toEqual([]);
  },
};
