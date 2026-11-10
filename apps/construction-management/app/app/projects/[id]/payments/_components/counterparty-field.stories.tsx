import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";
import { Label } from "@repo/ui/components/label";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { financeLookupsHandler } from "./account-fixtures";
import {
  CounterpartyField,
  EMPTY_COUNTERPARTY,
  type CounterpartyValue,
} from "./counterparty-field";
import { PaymentCategoryPicker } from "./payment-category-picker";

function Harness({
  onChange,
}: {
  onChange: (value: CounterpartyValue, categoryId: string) => void;
}) {
  const [party, setParty] = useState(EMPTY_COUNTERPARTY);
  const [category, setCategory] = useState("");
  return (
    <div className="w-full max-w-md space-y-4 p-6">
      <div className="space-y-1.5">
        <Label htmlFor="paid-to">Paid to</Label>
        <CounterpartyField
          id="paid-to"
          projectId={null}
          value={party}
          onChange={(next) => {
            setParty(next);
            onChange(next, category);
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="category">Payment Category</Label>
        <PaymentCategoryPicker
          id="category"
          optional
          value={category}
          onChange={(next) => {
            setCategory(next);
            onChange(party, next);
          }}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Finance/CounterpartyField",
  component: Harness,
  args: { onChange: fn() },
  beforeEach: () => mockApi(financeLookupsHandler).restore,
  render: (args) => (
    <StoryQueries>
      <Harness {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TypedNameOrPickedParty: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(canvas.getByLabelText("Paid to"), "Tea stall");
    await expect(args.onChange).toHaveBeenLastCalledWith(
      { kind: null, id: null, name: "Tea stall" },
      "",
    );

    await userEvent.click(canvas.getByRole("combobox", { name: "Party kind" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Supplier" }),
    );
    await userEvent.click(
      await canvas.findByRole("combobox", { name: "Paid to" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Chennai Cements" }),
    );
    await waitFor(() =>
      expect(args.onChange).toHaveBeenLastCalledWith(
        {
          kind: "supplier",
          id: "0199a000-0000-7000-8000-0000000000d2",
          name: "Chennai Cements",
        },
        "",
      ),
    );

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Payment Category" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "Fuel" }));
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "supplier" }),
      "0199a000-0000-7000-8000-0000000000c2",
    );
  },
};

export const NoPartiesOfThatKind: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Party kind" }));
    await userEvent.click(await body.findByRole("option", { name: "Vendor" }));
    await expect(await canvas.findByText("No Vendor here yet")).toBeVisible();
  },
};
