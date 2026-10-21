import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { RateSummary } from "./rate-summary";

const TOTALS = { subtotal: 54_198, overhead: 8_130, analysed: 62_328 };

const meta = {
  title: "Masters/Item Library/Analysed vs adopted",
  component: RateSummary,
  args: {
    totals: TOTALS,
    overheadPercent: "15",
    adoptedRate: 65_000,
    onUseAnalysed: fn(),
  },
  render: (args) => (
    <div className="max-w-4xl p-6">
      <RateSummary {...args} />
    </div>
  ),
} satisfies Meta<typeof RateSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The adopted rate above the analysed one: the gap in ₹ and %, and the button copies the analysed rate. */
export const AdoptedAbove: Story = {
  play: async ({ canvas, args, userEvent }) => {
    const summary = canvas.getByRole("region", {
      name: "Analysed and adopted rate",
    });
    const view = within(summary);
    await expect(view.getByText("₹541.98")).toBeVisible();
    await expect(view.getByText("Overhead and profit (15 %)")).toBeVisible();
    await expect(view.getByText("₹81.30")).toBeVisible();
    await expect(view.getByText("₹623.28")).toBeVisible();
    await expect(view.getByText("+₹26.72 (+4.29 %)")).toBeVisible();
    await expect(
      view.getByText(
        "The adopted rate is ₹26.72 (4.29 %) above the analysed rate.",
      ),
    ).toBeVisible();
    await userEvent.click(
      view.getByRole("button", { name: "Use analysed rate" }),
    );
    await expect(args.onUseAnalysed).toHaveBeenCalledWith(62_328);
  },
};

/** The adopted rate below the analysed one. */
export const AdoptedBelow: Story = {
  args: { adoptedRate: 50_000 },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("−₹123.28 (−19.78 %)")).toBeVisible();
    await expect(
      canvas.getByText(
        "The adopted rate is ₹123.28 (19.78 %) below the analysed rate.",
      ),
    ).toBeVisible();
  },
};

/** The two rates agree: nothing to copy. */
export const Matches: Story = {
  args: { adoptedRate: 62_328 },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("The adopted rate matches the analysed rate."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Use analysed rate" }),
    ).toBeDisabled();
  },
};

/** A line is still incomplete: no analysed rate yet. */
export const Incomplete: Story = {
  args: {
    totals: { subtotal: null, overhead: null, analysed: null },
    overheadPercent: "",
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Complete every line to see the analysed rate."),
    ).toBeVisible();
    await expect(canvas.getByText("Overhead and profit")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Use analysed rate" }),
    ).toBeDisabled();
  },
};
