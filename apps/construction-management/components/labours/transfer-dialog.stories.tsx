import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import { mockFetch } from "../../.storybook/mock-fetch";
import { PROJECT_OPTIONS, RAJU, SEEMA, VILLA } from "./labour-fixtures";
import { TransferDialog } from "./transfer-dialog";

const TRANSFER = "/api/construction/labour/labours/transfer";

let api: ReturnType<typeof mockFetch>;

function serve(respond: () => Response) {
  return () => {
    api = mockFetch([
      {
        path: "/api/construction/projects/projects/options",
        respond: () => Response.json({ items: PROJECT_OPTIONS }),
      },
      { method: "POST", path: TRANSFER, respond },
    ]);
    return api.restore;
  };
}

function sentBody(): unknown {
  const call = api.spy.mock.calls.find(([input]) => input === TRANSFER);
  const body = call?.[1]?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

const meta = {
  title: "Masters/Labours/Transfer dialog",
  component: TransferDialog,
  args: {
    labours: [RAJU],
    open: true,
    onOpenChange: fn(),
    onTransferred: fn(),
  },
  render: (args) => (
    <StoryQueryClient>
      <TransferDialog {...args} />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof TransferDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TransferOne: Story = {
  beforeEach: serve(() => Response.json({ items: [RAJU] })),
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", {
      name: "Transfer Raju Pawar",
    });
    const inDialog = within(dialog);
    await userEvent.click(inDialog.getByRole("button", { name: "Transfer" }));
    await expect(
      await inDialog.findByText("Choose the Project"),
    ).toBeInTheDocument();

    await userEvent.click(
      inDialog.getByRole("combobox", { name: "To Project" }),
    );
    // Raju is on Tower A, so only the other Project is offered.
    await expect(
      await body.findByRole("option", { name: "Villa Phase 2" }),
    ).toBeInTheDocument();
    await expect(body.queryByRole("option", { name: "Tower A" })).toBeNull();
    await userEvent.click(body.getByRole("option", { name: "Villa Phase 2" }));
    const date = inDialog.getByLabelText("Transfer date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-04");
    await userEvent.type(inDialog.getByLabelText("Remark"), "Slab work");
    await userEvent.click(inDialog.getByRole("button", { name: "Transfer" }));

    await waitFor(() => expect(args.onTransferred).toHaveBeenCalled());
    await expect(sentBody()).toEqual({
      labourIds: [RAJU.id],
      toProjectId: VILLA.id,
      transferDate: "2026-10-04",
      remark: "Slab work",
    });
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const RefusedBeforeAttendance: Story = {
  args: { labours: [RAJU, SEEMA] },
  beforeEach: serve(() =>
    Response.json(
      {
        code: "TRANSFER_BEFORE_ATTENDANCE",
        message:
          "Raju Pawar has attendance up to 2026-10-06 in their current Project. Choose a later date.",
      },
      { status: 409 },
    ),
  ),
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", {
      name: "Transfer 2 Labours",
    });
    const inDialog = within(dialog);
    await userEvent.click(
      inDialog.getByRole("combobox", { name: "To Project" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Villa Phase 2" }),
    );
    await userEvent.click(inDialog.getByRole("button", { name: "Transfer" }));
    await expect(
      await inDialog.findByText(/has attendance up to 2026-10-06/),
    ).toBeVisible();
    await expect(inDialog.getByLabelText("Transfer date")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(args.onTransferred).not.toHaveBeenCalled();
  },
};
