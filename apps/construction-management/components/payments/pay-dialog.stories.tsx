import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { PayDialog } from "./pay-dialog";
import {
  OWNER_MEMBER,
  PAYERS,
  PROJECT_ID,
  DHURESH_ID,
  DHURESH_PAYMENT,
  SUNDAR_MEMBER,
  TODAY,
} from "./payment-fixtures";

const API = "/api/construction/labour/payments";
const PAYERS_PATH = `${API}/payers?projectId=${PROJECT_ID}&partyType=labour`;

let api: ReturnType<typeof mockApi>;

function serve(
  record: () => Response = () =>
    Response.json(DHURESH_PAYMENT, { status: 201 }),
) {
  return () => {
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === PAYERS_PATH)
        return Response.json(PAYERS);
      if (call.method === "POST" && call.path === API) return record();
      return undefined;
    });
    return api.restore;
  };
}

function sent(): unknown {
  return api.calls.mock.calls
    .map(([call]) => call)
    .find((call) => call.method === "POST" && call.path === API)?.body;
}

const meta = {
  title: "Payments/Pay dialog",
  component: PayDialog,
  args: {
    projectId: PROJECT_ID,
    partyType: "labour",
    party: { id: DHURESH_ID, name: "Dhuresh Nawin", finalAmount: 200_000 },
    today: TODAY,
    onOpenChange: fn(),
    onPaid: fn(),
  },
  render: (args) => (
    <StoryQueries>
      <PayDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof PayDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The amount starts at the Final Amount and "Paid by" at the signed-in
 * Team Member; Bank asks for a reference; rupees go out as paise.
 */
export const DefaultsAndSendsPaise: Story = {
  beforeEach: serve(),
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Pay Dhuresh Nawin" }),
    );
    const amount = await dialog.findByLabelText("Amount");
    await expect(amount).toHaveValue("2000");
    await expect(dialog.getByLabelText("Payment date")).toHaveValue(TODAY);
    await expect(
      dialog.getByRole("combobox", { name: "Paid by" }),
    ).toHaveTextContent("Arun Selva Kumar");

    await userEvent.click(dialog.getByRole("button", { name: "Bank" }));
    await userEvent.click(
      dialog.getByRole("button", { name: "Record payment" }),
    );
    await expect(
      await dialog.findByText("Enter the cheque or transaction number"),
    ).toBeVisible();
    await expect(sent()).toBeUndefined();

    await userEvent.type(dialog.getByLabelText("Reference"), "UTR 88231");
    await userEvent.clear(amount);
    await userEvent.type(amount, "1500.50");
    await userEvent.click(dialog.getByRole("button", { name: "Advance" }));
    await userEvent.click(dialog.getByRole("combobox", { name: "Paid by" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Sundar Rajan" }),
    );
    await userEvent.type(dialog.getByLabelText("Remarks"), "Festival advance");
    await userEvent.click(
      dialog.getByRole("button", { name: "Record payment" }),
    );

    await waitFor(() => expect(args.onPaid).toHaveBeenCalled());
    await expect(sent()).toEqual({
      partyType: "labour",
      partyId: DHURESH_ID,
      projectId: PROJECT_ID,
      paymentDate: TODAY,
      kind: "advance",
      mode: "bank",
      amount: 150_050,
      reference: "UTR 88231",
      paidByMemberId: SUNDAR_MEMBER,
      remarks: "Festival advance",
    });
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

/** Nothing owed and no Financial: the amount starts empty and is required. */
export const ValidatesAmount: Story = {
  args: { party: { id: DHURESH_ID, name: "Dhuresh Nawin", finalAmount: null } },
  beforeEach: serve(),
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Pay Dhuresh Nawin" }),
    );
    const amount = await dialog.findByLabelText("Amount");
    await expect(amount).toHaveValue("");
    await userEvent.click(
      dialog.getByRole("button", { name: "Record payment" }),
    );
    await expect(
      await dialog.findByText("Enter an amount more than zero"),
    ).toBeVisible();
    await userEvent.type(amount, "0");
    await userEvent.click(
      dialog.getByRole("button", { name: "Record payment" }),
    );
    await expect(
      await dialog.findByText("Enter an amount more than zero"),
    ).toBeVisible();
    await expect(args.onPaid).not.toHaveBeenCalled();
    await expect(sent()).toBeUndefined();
  },
};

/** A refusal from the server lands under the field it is about. */
export const BackdatedRefused: Story = {
  beforeEach: serve(() =>
    Response.json(
      {
        code: "BACKDATED_CREATE_BLOCKED",
        message:
          "Labour payment entries older than 2 days cannot be created. The earliest date allowed is 2026-09-18.",
      },
      { status: 403 },
    ),
  ),
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Pay Dhuresh Nawin" }),
    );
    const date = await dialog.findByLabelText("Payment date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-09-01");
    await userEvent.click(
      dialog.getByRole("button", { name: "Record payment" }),
    );
    await expect(
      await dialog.findByText(/earliest date allowed is 2026-09-18/),
    ).toBeVisible();
    await expect(date).toHaveAttribute("aria-invalid", "true");
    await expect(args.onPaid).not.toHaveBeenCalled();
    await expect(sent()).toMatchObject({
      paymentDate: "2026-09-01",
      amount: 200_000,
      paidByMemberId: OWNER_MEMBER,
    });
  },
};
