import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type {
  PreschoolChildFeeAccount,
  PreschoolInvoice,
} from "@/src/queries/preschool/fees";

import { ChildFeeAccountScreen } from "./child-fee-account-screen";

const AARAV = "7a0e8400-e29b-41d4-a716-446655440001";
const ADMISSION = "7b0e8400-e29b-41d4-a716-446655440001";
const TUITION = "9c0e8400-e29b-41d4-a716-446655440002";

function invoice(overrides: Partial<PreschoolInvoice>): PreschoolInvoice {
  return {
    id: "9d0e8400-e29b-41d4-a716-446655440001",
    admissionId: ADMISSION,
    feeHeadId: TUITION,
    feeHeadName: "Tuition",
    label: "Tuition — Term 1",
    dueOn: "2026-06-01",
    amountPaise: 1_200_000,
    concessionPaise: 0,
    concessionReason: null,
    paidPaise: 0,
    duePaise: 1_200_000,
    status: "overdue",
    ...overrides,
  };
}

const ADMISSION_FEE = invoice({
  id: "9d0e8400-e29b-41d4-a716-446655440000",
  feeHeadName: "Admission fee",
  label: "Admission fee",
  amountPaise: 500_000,
  paidPaise: 500_000,
  duePaise: 0,
  status: "paid",
});
const TERM_1 = invoice({});
const TERM_3 = invoice({
  id: "9d0e8400-e29b-41d4-a716-446655440003",
  label: "Tuition — Term 3",
  dueOn: "2026-12-01",
  status: "upcoming",
});

function account(
  invoices: PreschoolInvoice[],
  totals: Partial<PreschoolChildFeeAccount["totals"]> = {},
): PreschoolChildFeeAccount {
  return {
    child: {
      id: AARAV,
      centreId: CENTRE_IDS.annaNagar,
      firstName: "Aarav",
      lastName: "Kumar",
      admissionNumber: "LSAN-0007",
      status: "active",
      classroom: {
        id: "6a0e8400-e29b-41d4-a716-446655440001",
        name: "Nursery A",
      },
      programme: {
        id: "9a0e8400-e29b-41d4-a716-446655440001",
        name: "Nursery (Pre-KG)",
      },
      academicYear: {
        id: "5c0e8400-e29b-41d4-a716-446655440000",
        name: "2026–27",
      },
      fatherName: "Ravi Kumar",
      fatherPhone: "98400 12345",
      motherName: "Meena Kumar",
      motherPhone: null,
    },
    invoices,
    payments:
      invoices.length === 0
        ? []
        : [
            {
              id: "8a0e8400-e29b-41d4-a716-446655440001",
              receiptNumber: "LSAN/2026-27/00042",
              receivedOn: "2026-06-03",
              amountPaise: 500_000,
              method: "cash",
              reference: null,
            },
          ],
    totals: {
      billedPaise: 2_900_000,
      concessionPaise: 0,
      paidPaise: 500_000,
      duePaise: 2_400_000,
      overduePaise: 1_200_000,
      ...totals,
    },
  };
}

const calls: PreschoolApiCall[] = [];

const meta = {
  title: "Preschool/Fees/Child fee account",
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: { pathname: `/preschool/fees/children/${AARAV}` },
    },
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

export const Account: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      routes: {
        [`GET /fees/children/${AARAV}`]: () => ({
          json: account([ADMISSION_FEE, TERM_1, TERM_3]),
        }),
        [`POST /fees/invoices/${TERM_1.id}/concession`]: () => ({
          json: { ...TERM_1, concessionPaise: 120_000 },
        }),
      },
    });
  },
  render: () => <ChildFeeAccountScreen childId={AARAV} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Aarav Kumar" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("LSAN-0007 · Nursery A · Ravi Kumar 98400 12345"),
    ).toBeVisible();
    await expect(canvas.getByText("₹29,000")).toBeVisible();
    await expect(canvas.getByText("₹12,000", { selector: "dd" })).toHaveClass(
      "text-destructive",
    );
    await expect(canvas.getByText("Paid", { selector: "span" })).toBeVisible();
    await expect(canvas.getByText("Upcoming")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "LSAN/2026-27/00042" }),
    ).toHaveAttribute(
      "href",
      "/preschool/fees/receipts/8a0e8400-e29b-41d4-a716-446655440001",
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Tuition — Term 1" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Concession" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    const amount = dialog.getByLabelText("Concession (₹)");
    await userEvent.clear(amount);
    await userEvent.type(amount, "1200");
    await userEvent.click(
      dialog.getByRole("button", { name: "Save concession" }),
    );
    await expect(
      await dialog.findByText("Say why the concession is given"),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Sibling" }));
    await userEvent.click(
      dialog.getByRole("button", { name: "Save concession" }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.route.endsWith("/concession"))?.body,
      ).toEqual({ concessionPaise: 120_000, reason: "Sibling" }),
    );
  },
};

export const EditBelowPaid: Story = {
  beforeEach() {
    return mockPreschoolApi({
      routes: {
        [`GET /fees/children/${AARAV}`]: () => ({
          json: account([{ ...TERM_1, paidPaise: 600_000, status: "overdue" }]),
        }),
        [`POST /fees/invoices/${TERM_1.id}/details`]: () => ({
          status: 409,
          json: {
            code: "INVOICE_AMOUNT_BELOW_PAID",
            message:
              "The amount cannot be less than what is already paid plus the concession.",
          },
        }),
      },
    });
  },
  render: () => <ChildFeeAccountScreen childId={AARAV} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Actions for Tuition — Term 1",
      }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Cancel Invoice" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(body.getByRole("menuitem", { name: "Edit" }));
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      dialog.getByText(/Paid and concession so far: ₹6,000/),
    ).toBeVisible();
    const amount = dialog.getByLabelText("Amount (₹)");
    await userEvent.clear(amount);
    await userEvent.type(amount, "5000");
    await userEvent.click(dialog.getByRole("button", { name: "Save Invoice" }));
    await expect(
      await dialog.findByText(
        "The amount cannot be less than what is already paid plus the concession.",
      ),
    ).toBeVisible();
    await expect(amount).toHaveAttribute("aria-invalid", "true");
  },
};

export const NoInvoices: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      routes: {
        [`GET /fees/children/${AARAV}`]: () => ({
          json: account([], {
            billedPaise: 0,
            paidPaise: 0,
            duePaise: 0,
            overduePaise: 0,
          }),
        }),
        [`POST /fees/children/${AARAV}/generate`]: () => ({
          status: 409,
          json: {
            code: "FEE_STRUCTURE_MISSING",
            message:
              "There is no Fee Structure for this Child's Programme and Academic Year.",
          },
        }),
      },
    });
  },
  render: () => <ChildFeeAccountScreen childId={AARAV} />,
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("No Invoices yet")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Collect payment" }),
    ).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Generate Invoices from the Fee Structure",
      }),
    );
    await expect(
      await canvas.findByText(
        "There is no Fee Structure for this Child's Programme and Academic Year.",
      ),
    ).toBeVisible();
    await expect(calls.map((call) => call.route)).toContain(
      `POST /fees/children/${AARAV}/generate`,
    );
  },
};

export const CollectFromAccount: Story = {
  beforeEach() {
    return mockPreschoolApi({
      routes: {
        [`GET /fees/children/${AARAV}`]: () => ({
          json: account([ADMISSION_FEE, TERM_1, TERM_3]),
        }),
      },
    });
  },
  render: () => <ChildFeeAccountScreen childId={AARAV} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Collect payment" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await expect(dialog.getByLabelText("Amount (₹)")).toHaveValue("12000");
    await expect(dialog.getByText("₹24,000")).toBeVisible();
  },
};
