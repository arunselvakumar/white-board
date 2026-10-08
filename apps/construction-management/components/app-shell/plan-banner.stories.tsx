import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import {
  activeView,
  expiredView,
  memberView,
  mockSubscriptionApi,
  trialView,
} from "@/components/subscription/subscription-story-fixtures";

import { signInAs } from "../../.storybook/mocks/auth";
import { PlanBanner } from "./plan-banner";

const meta = {
  title: "App/PlanBanner",
  component: PlanBanner,
} satisfies Meta<typeof PlanBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Trial: Story = {
  beforeEach() {
    signInAs("owner");
    return mockSubscriptionApi({ subscription: trialView }).restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Free trial: 9 days left"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Choose a plan" }),
    ).toHaveAttribute("href", "/app/subscription/checkout?kind=new");
  },
};

export const Expired: Story = {
  beforeEach() {
    signInAs("owner");
    return mockSubscriptionApi({ subscription: expiredView }).restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Your plan has ended. Your data is safe and read-only; export is still available.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Choose a plan" }),
    ).toBeVisible();
  },
};

export const ExpiredForAMember: Story = {
  beforeEach() {
    signInAs("member");
    return mockSubscriptionApi({
      subscription: { ...memberView, status: "expired", daysLeft: 0 },
    }).restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Ask the Owner to choose a plan."),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Choose a plan" }),
    ).toBeNull();
  },
};

export const RunningPlanShowsNothing: Story = {
  beforeEach() {
    signInAs("owner");
    const api = mockSubscriptionApi({ subscription: activeView });
    return api.restore;
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector("[role=status]")).toBeNull(),
    );
  },
};
