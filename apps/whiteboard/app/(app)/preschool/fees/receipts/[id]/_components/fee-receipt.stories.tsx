import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, spyOn, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type { PreschoolReceipt } from "@/src/queries/preschool/fees";

import { FeeReceiptScreen } from "./fee-receipt-screen";

const PAYMENT = "8a0e8400-e29b-41d4-a716-446655440001";
const AARAV = "7a0e8400-e29b-41d4-a716-446655440001";

const RECEIPT: PreschoolReceipt = {
  id: PAYMENT,
  receiptNumber: "LSAN/2026-27/00042",
  receivedOn: "2026-11-25",
  centre: {
    id: CENTRE_IDS.annaNagar,
    name: "Little Steps Anna Nagar",
    addressLine: "12, 4th Avenue",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600040",
    phone: "044 2620 1234",
  },
  child: {
    id: AARAV,
    firstName: "Aarav",
    lastName: "Kumar",
    admissionNumber: "LSAN-0007",
    classroomName: "Nursery A",
    fatherName: "Ravi Kumar",
    motherName: "Meena Kumar",
  },
  lines: [
    {
      invoiceId: "9b0e8400-e29b-41d4-a716-446655440001",
      label: "Admission fee",
      amountPaise: 500_000,
    },
    {
      invoiceId: "9b0e8400-e29b-41d4-a716-446655440002",
      label: "Tuition — Term 1",
      amountPaise: 750_000,
    },
  ],
  amountPaise: 1_250_000,
  amountInWords: "Rupees Twelve Thousand Five Hundred Only",
  method: "upi",
  reference: "UPI-881234",
  note: null,
  receivedByName: "Arun",
  balanceDuePaise: 2_850_000,
};

let printed = 0;

const meta = {
  title: "Preschool/Fees/Receipt",
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: { pathname: `/preschool/fees/receipts/${PAYMENT}` },
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

export const Receipt: Story = {
  beforeEach() {
    printed = 0;
    const print = spyOn(window, "print").mockImplementation(() => {
      printed += 1;
    });
    const cleanup = mockPreschoolApi({
      routes: {
        [`GET /fees/payments/${PAYMENT}`]: () => ({ json: RECEIPT }),
      },
    });
    return () => {
      print.mockRestore();
      cleanup();
    };
  },
  render: () => <FeeReceiptScreen paymentId={PAYMENT} />,
  play: async ({ canvas, userEvent }) => {
    const receipt = within(
      await canvas.findByRole("article", {
        name: "Fee Receipt LSAN/2026-27/00042",
      }),
    );
    await expect(receipt.getByText("Little Steps Anna Nagar")).toBeVisible();
    await expect(
      receipt.getByText("12, 4th Avenue, Chennai, Tamil Nadu 600040"),
    ).toBeVisible();
    await expect(receipt.getByText("Fee Receipt")).toBeVisible();
    await expect(receipt.getByText("25 Nov 2026")).toBeVisible();
    await expect(receipt.getByText("Aarav Kumar")).toBeVisible();
    await expect(receipt.getByText("Tuition — Term 1")).toBeVisible();
    await expect(receipt.getByText("₹12,500")).toBeVisible();
    await expect(
      receipt.getByText("Rupees Twelve Thousand Five Hundred Only"),
    ).toBeVisible();
    await expect(receipt.getByText("UPI reference")).toBeVisible();
    await expect(receipt.getByText("UPI-881234")).toBeVisible();
    await expect(receipt.getByText("₹28,500")).toBeVisible();
    await expect(
      receipt.getByText("This is a computer-generated receipt."),
    ).toBeVisible();

    await expect(
      canvas.getByRole("link", { name: "Back to fee account" }),
    ).toHaveAttribute("href", `/preschool/fees/children/${AARAV}`);
    const share = canvas.getByRole("link", { name: "Share on WhatsApp" });
    await expect(share).toHaveAttribute("target", "_blank");
    await expect(
      new URL(share.getAttribute("href") ?? "").searchParams.get("text"),
    ).toContain("LSAN/2026-27/00042");
    await userEvent.click(canvas.getByRole("button", { name: "Print" }));
    await expect(printed).toBe(1);
  },
};
