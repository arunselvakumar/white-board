import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Suspense } from "react";
import { expect, waitFor, within } from "storybook/test";

import { razorpayWindow, type RazorpayOptions } from "@/lib/razorpay-checkout";

import { signInAs } from "../../.storybook/mocks/auth";
import { CheckoutWizard } from "./checkout-wizard";
import {
  activeView,
  memberView,
  mockSubscriptionApi,
  noPlanView,
} from "./subscription-story-fixtures";

/** Razorpay Checkout stand-in: pays at once and calls the success handler. */
function installFakeRazorpay(outcome: "pay" | "dismiss" = "pay") {
  const opened: RazorpayOptions[] = [];
  razorpayWindow().Razorpay = class {
    constructor(private readonly options: RazorpayOptions) {}
    open() {
      opened.push(this.options);
      if (outcome === "dismiss") this.options.modal?.ondismiss?.();
      else
        this.options.handler({
          razorpay_order_id: this.options.order_id,
          razorpay_payment_id: "pay_story_1",
          razorpay_signature: "signature",
        });
    }
    on() {
      // Failures are not simulated.
    }
  };
  return {
    opened,
    restore: () => {
      delete razorpayWindow().Razorpay;
    },
  };
}

const meta = {
  title: "Subscription/CheckoutWizard",
  component: CheckoutWizard,
  render: (args) => (
    <Suspense fallback={<p>Loading…</p>}>
      <CheckoutWizard {...args} />
    </Suspense>
  ),
} satisfies Meta<typeof CheckoutWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstPlan: Story = {
  args: { kind: "new" },
  beforeEach() {
    signInAs("owner");
    const api = mockSubscriptionApi({ subscription: noPlanView });
    const razorpay = installFakeRazorpay();
    return () => {
      api.restore();
      razorpay.restore();
    };
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("Step 1 of 5 · Plan")).toBeVisible();
    await expect(canvas.getByRole("radio", { name: /Basic/ })).toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    await expect(
      await canvas.findByText("Step 2 of 5 · Duration"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("radio", { name: /12 months/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    await expect(
      await canvas.findByText("Step 3 of 5 · Add-ons"),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("HRMS Team Member"), "2");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(
      await canvas.findByText("Enter 0 or a whole number from 5 to 500"),
    ).toBeVisible();
    await userEvent.clear(canvas.getByLabelText("HRMS Team Member"));
    await userEvent.type(canvas.getByLabelText("Extra Team Member"), "2");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    await expect(
      await canvas.findByText("Step 4 of 5 · Buyer details"),
    ).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText("Billing name"),
      "Patil Builders",
    );
    await userEvent.type(
      canvas.getByLabelText("Billing address"),
      "Plot 4, Baner, Pune 411045",
    );
    await userEvent.click(canvas.getByLabelText("State"));
    await userEvent.click(
      await body.findByRole("option", { name: "Karnataka" }),
    );
    await userEvent.type(
      canvas.getByLabelText("GSTIN (optional)"),
      "27AAPFU0939F1ZV",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(
      await canvas.findByText("The GSTIN belongs to a different state"),
    ).toBeVisible();
    await userEvent.click(canvas.getByLabelText("State"));
    await userEvent.click(
      await body.findByRole("option", { name: "Maharashtra" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    await expect(
      await canvas.findByRole("heading", { name: "Order summary" }),
    ).toBeVisible();
    await expect(canvas.getByText("CGST 9%")).toBeVisible();
    await expect(canvas.getByText("₹33,247.68")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Pay ₹33,247.68" }),
    );
    await expect(
      await canvas.findByRole("heading", { name: "Payment received" }),
    ).toBeVisible();
    await expect(canvas.getByText(/Invoice CM\/26-27\/00002/)).toBeVisible();
  },
};

export const PaymentCancelled: Story = {
  args: { kind: "extend" },
  beforeEach() {
    signInAs("owner");
    const api = mockSubscriptionApi({ subscription: activeView });
    const razorpay = installFakeRazorpay("dismiss");
    return () => {
      api.restore();
      razorpay.restore();
    };
  },
  play: async ({ canvas, userEvent }) => {
    // Extending keeps the plan: duration, buyer (pre-filled), review.
    await expect(
      await canvas.findByText("Step 1 of 3 · Duration"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByLabelText("Billing name")).toHaveValue(
      "Patil Builders",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("button", { name: /^Pay / }));
    await expect(
      await canvas.findByText("Payment was cancelled. Nothing was charged."),
    ).toBeVisible();
  },
};

export const AddOnsOnly: Story = {
  args: { kind: "add_ons" },
  beforeEach() {
    signInAs("owner");
    return mockSubscriptionApi({ subscription: activeView }).restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText("Step 1 of 3 · Add-ons"),
    ).toBeVisible();
    await expect(
      canvas.getByText(/for the 182 days left on your plan/),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(
      await canvas.findByText("Choose at least one add-on."),
    ).toBeVisible();
  },
};

export const PaymentsNotConfigured: Story = {
  args: { kind: "new" },
  beforeEach() {
    signInAs("owner");
    return mockSubscriptionApi({
      subscription: {
        ...noPlanView,
        owner: {
          unusedValuePaise: 0,
          lastBillingAddress: null,
          paymentsConfigured: false,
        },
      },
    }).restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Payments are not configured"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Your Subscription" }),
    ).toHaveAttribute("href", "/app/subscription");
    await expect(canvas.queryByRole("button", { name: "Continue" })).toBeNull();
  },
};

export const MemberCannotBuy: Story = {
  args: { kind: "new" },
  beforeEach() {
    signInAs("member");
    return mockSubscriptionApi({ subscription: memberView }).restore;
  },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(
        canvas.getByText("Only the Owner can buy or change the plan"),
      ).toBeVisible(),
    );
  },
};
