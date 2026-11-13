import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import { CancelVisitDialog, RescheduleVisitDialog } from "./visit-dialogs";
import {
  MARKETING_VISITS_API,
  PLANNED_ID,
  mockVisitApi,
  plannedVisit,
} from "./visit-fixtures";

let api: ReturnType<typeof mockVisitApi>;

function posts(action: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === "POST" &&
        call.path === `${MARKETING_VISITS_API}/${PLANNED_ID}/${action}`,
    );
}

const meta = {
  title: "Marketing/Visits/Reschedule and Cancel dialogs",
  component: RescheduleVisitDialog,
  args: { visit: plannedVisit(), open: true, onOpenChange: fn() },
  beforeEach: () => {
    api = mockVisitApi();
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <RescheduleVisitDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof RescheduleVisitDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Starts at the planned time; the new one is sent as an instant. */
export const Reschedule: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Reschedule Visit",
      }),
    );
    await expect(
      dialog.getByText(
        "MV-0004 is planned for 14 Nov 2026, 11:30 am. The old time stays in its history.",
      ),
    ).toBeVisible();
    await expect(dialog.getByLabelText("New date")).toHaveValue("2026-11-14");
    await expect(dialog.getByLabelText("New time")).toHaveValue("11:30");
    await userEvent.clear(dialog.getByLabelText("New date"));
    await userEvent.type(dialog.getByLabelText("New date"), "2026-11-16");
    await userEvent.clear(dialog.getByLabelText("New time"));
    await userEvent.type(dialog.getByLabelText("New time"), "10:00");
    await userEvent.click(dialog.getByRole("button", { name: "Reschedule" }));
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
    await expect(posts("reschedule")[0]?.body).toEqual({
      visitAt: "2026-11-16T04:30:00.000Z",
      expectedUpdatedAt: "2026-11-12T04:00:00.000Z",
    });
  },
};

/** The reason is required; the Visit is cancelled with it. */
export const Cancel: Story = {
  render: (args) => (
    <StoryQueries>
      <CancelVisitDialog {...args} />
    </StoryQueries>
  ),
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Cancel Visit",
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Cancel Visit" }));
    await expect(
      await dialog.findByText("Say why the Visit is cancelled."),
    ).toBeVisible();
    await expect(posts("cancel")).toHaveLength(0);
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Client not available this week",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Cancel Visit" }));
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
    await expect(posts("cancel")[0]?.body).toEqual({
      reason: "Client not available this week",
      expectedUpdatedAt: "2026-11-12T04:00:00.000Z",
    });
  },
};
