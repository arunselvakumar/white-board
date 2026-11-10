import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";
import { Label } from "@repo/ui/components/label";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { ACCOUNT_OPTIONS, accountOptionsHandler } from "./account-fixtures";
import { AccountPicker, type AccountPickerMode } from "./account-picker";

const [CASH, BANK, PETTY] = ACCOUNT_OPTIONS as [
  (typeof ACCOUNT_OPTIONS)[number],
  (typeof ACCOUNT_OPTIONS)[number],
  (typeof ACCOUNT_OPTIONS)[number],
];

function Harness({
  mode: initialMode,
  onChange,
}: {
  mode: AccountPickerMode;
  onChange: (id: string) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [value, setValue] = useState("");
  return (
    <div className="w-full max-w-md space-y-2 p-6">
      <Label htmlFor="paid-from">Paid from</Label>
      <AccountPicker
        id="paid-from"
        mode={mode}
        value={value}
        onChange={(id) => {
          setValue(id);
          onChange(id);
        }}
      />
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => {
            setMode("cash");
          }}
        >
          Cash
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("upi");
          }}
        >
          UPI
        </button>
      </div>
      <output aria-label="Chosen account">{value || "none"}</output>
    </div>
  );
}

const meta = {
  title: "Finance/AccountPicker",
  component: Harness,
  args: { mode: "cash", onChange: fn() },
  beforeEach: () => mockApi((call) => accountOptionsHandler(call)).restore,
  render: (args) => (
    <StoryQueries>
      <Harness {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CashStartsOnThePrimaryAccount: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitFor(() =>
      expect(canvas.getByLabelText("Chosen account")).toHaveTextContent(
        CASH.id,
      ),
    );
    await userEvent.click(canvas.getByRole("combobox", { name: "Paid from" }));
    const list = within(
      await within(canvasElement.ownerDocument.body).findByRole("listbox"),
    );
    // Cash: the cash account and petty cash, never the bank.
    await expect(list.getAllByRole("option")).toHaveLength(2);
    await expect(
      list.getByRole("option", { name: /My petty cash \(Ravi Kumar\)/ }),
    ).toBeVisible();
    await userEvent.click(list.getByRole("option", { name: /My petty cash/ }));
    await expect(canvas.getByLabelText("Chosen account")).toHaveTextContent(
      PETTY.id,
    );
  },
};

export const UpiMovesToTheBankAccount: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await waitFor(() =>
      expect(canvas.getByLabelText("Chosen account")).toHaveTextContent(
        CASH.id,
      ),
    );
    await userEvent.click(canvas.getByRole("button", { name: "UPI" }));
    await waitFor(() =>
      expect(args.onChange).toHaveBeenLastCalledWith(BANK.id),
    );
  },
};

export const NoBankAccountYet: Story = {
  args: { mode: "upi" },
  beforeEach: () =>
    mockApi((call) => accountOptionsHandler(call, [CASH])).restore,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No bank account yet")).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Paid from" }),
    ).toBeDisabled();
  },
};
