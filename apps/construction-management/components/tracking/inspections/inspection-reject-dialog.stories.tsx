import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { InspectionRejectDialog } from "./inspection-format";

const meta = {
  title: "Tracking/Inspections/Reject dialog",
  component: InspectionRejectDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    title: "Reject IR/26-27/00004?",
    description:
      "A rejected request is final. You can raise a re-inspection once the work is put right.",
    canRaiseSnag: true,
    onSubmit: fn(() => Promise.resolve()),
  },
} satisfies Meta<typeof InspectionRejectDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function dialogOf(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body).findByRole("dialog");
}

/** A reason is required; **Also raise a snag** goes with it. */
export const WithSnag: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(await dialogOf(canvasElement));
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(
      await dialog.findByText("Write why it is rejected."),
    ).toBeVisible();
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await userEvent.type(dialog.getByLabelText("Reason"), "  Honeycombing  ");
    await userEvent.click(
      dialog.getByRole("checkbox", { name: "Also raise a snag" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(async () => {
      await expect(args.onSubmit).toHaveBeenCalledWith({
        reason: "Honeycombing",
        raiseSnag: true,
      });
    });
  },
};

/** Without Issues & Snags Create the box is not offered. */
export const WithoutSnag: Story = {
  args: { canRaiseSnag: false },
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(await dialogOf(canvasElement));
    await expect(
      dialog.queryByRole("checkbox", { name: "Also raise a snag" }),
    ).toBeNull();
    await userEvent.type(dialog.getByLabelText("Reason"), "Gaps in shuttering");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(async () => {
      await expect(args.onSubmit).toHaveBeenCalledWith({
        reason: "Gaps in shuttering",
        raiseSnag: false,
      });
    });
  },
};

/** A refusal from the server stays in the dialog. */
export const Refused: Story = {
  args: {
    onSubmit: fn(() =>
      Promise.reject(
        new Error("This Inspection Request is approved, not pending."),
      ),
    ),
  },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(await dialogOf(canvasElement));
    await userEvent.type(dialog.getByLabelText("Reason"), "Late");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(
      await dialog.findByText(
        "This Inspection Request is approved, not pending.",
      ),
    ).toBeVisible();
  },
};

/** While the rejection is sent, Escape and Cancel do not close the dialog. */
export const Sending: Story = {
  args: {
    onSubmit: fn(() => new Promise<void>(() => undefined)),
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(await dialogOf(canvasElement));
    await userEvent.type(dialog.getByLabelText("Reason"), "Late");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(
      await dialog.findByRole("button", { name: "Rejecting…" }),
    ).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await expect(args.onOpenChange).not.toHaveBeenCalledWith(false);
    await expect(await dialogOf(canvasElement)).toBeVisible();
  },
};
