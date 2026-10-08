import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Suspense } from "react";
import { expect } from "storybook/test";

import { signInAs } from "../../.storybook/mocks/auth";
import { SubscriptionOverview } from "./subscription-overview";
import {
  activeView,
  expiredView,
  invoices,
  memberView,
  mockSubscriptionApi,
  trialView,
} from "./subscription-story-fixtures";

const meta = {
  title: "Subscription/YourSubscription",
  component: SubscriptionOverview,
  render: () => (
    <Suspense fallback={<p>Loading…</p>}>
      <SubscriptionOverview />
    </Suspense>
  ),
} satisfies Meta<typeof SubscriptionOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Trial: Story = {
  beforeEach() {
    signInAs("owner");
    return mockSubscriptionApi({ subscription: trialView }).restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Your Subscription" }),
    ).toBeVisible();
    await expect(canvas.getByText("Free trial")).toBeVisible();
    await expect(canvas.getByText(/9 days left/)).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Choose a plan" }),
    ).toHaveAttribute("href", "/app/subscription/checkout?kind=new");
    await expect(
      canvas.getByRole("progressbar", { name: "Team Members" }),
    ).toHaveAttribute("aria-valuetext", "3 of 5");
    await expect(await canvas.findByText("No invoices yet")).toBeVisible();
  },
};

export const Active: Story = {
  beforeEach() {
    signInAs("owner");
    return mockSubscriptionApi({ subscription: activeView, invoices }).restore;
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Active")).toBeVisible();
    for (const [name, kind] of [
      ["Extend", "extend"],
      ["Add-ons", "add_ons"],
      ["Choose plan", "upgrade"],
    ] as const)
      await expect(canvas.getByRole("link", { name })).toHaveAttribute(
        "href",
        `/app/subscription/checkout?kind=${kind}`,
      );
    await expect(
      canvas.getByText("Add-ons: Extra Team Member × 2"),
    ).toBeVisible();
    await expect(
      await canvas.findByRole("link", {
        name: "Download invoice CM/26-27/00001",
      }),
    ).toHaveAttribute("href", invoices.items[0]?.pdfPath);
    await expect(canvas.getByText("₹20,753.84")).toBeVisible();
  },
};

export const Expired: Story = {
  beforeEach() {
    signInAs("owner");
    return mockSubscriptionApi({ subscription: expiredView }).restore;
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Your plan has ended")).toBeVisible();
    await expect(
      canvas.getByText(
        /Your data is safe and read-only; export is still available/,
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Choose a plan" }),
    ).toBeVisible();
  },
};

export const MemberSeesNoPrices: Story = {
  beforeEach() {
    signInAs("member");
    return mockSubscriptionApi({ subscription: memberView, invoices }).restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Only the Owner can buy or change the plan."),
    ).toBeVisible();
    await expect(canvas.queryByRole("link", { name: /plan/i })).toBeNull();
    await expect(canvas.queryByText("Invoices")).toBeNull();
    await expect(canvas.queryByText(/₹/)).toBeNull();
  },
};
