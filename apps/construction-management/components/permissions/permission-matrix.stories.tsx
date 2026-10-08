import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, waitFor } from "storybook/test";

import type { PermissionGrants } from "@/src/shared-kernel/access";

import { PermissionMatrix } from "./permission-matrix";

function ControlledMatrix({
  initial,
  readOnly,
  onChange,
}: {
  initial: PermissionGrants;
  readOnly?: boolean;
  onChange: (next: PermissionGrants) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="p-6">
      <PermissionMatrix
        value={value}
        readOnly={readOnly}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </div>
  );
}

const meta = {
  title: "Permissions/PermissionMatrix",
  component: ControlledMatrix,
  args: { initial: {}, onChange: fn() },
} satisfies Meta<typeof ControlledMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TogglesACell: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const cell = canvas.getByRole("checkbox", {
      name: "Add — Purchase Request",
    });
    await expect(cell).not.toBeChecked();
    await userEvent.click(cell);
    await expect(cell).toBeChecked();
    await expect(args.onChange).toHaveBeenLastCalledWith({
      "procurement.purchase_requests": ["create"],
    });
    await expect(canvas.getByText("1 permission granted")).toBeVisible();
    // Only cells the menu supports have a checkbox: Gallery is View only.
    await expect(
      canvas.queryByRole("checkbox", { name: "Add — Gallery" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("checkbox", { name: "View — Gallery" }),
    ).toBeInTheDocument();
    await userEvent.click(cell);
    await expect(args.onChange).toHaveBeenLastCalledWith({});
  },
};

export const SelectsAColumn: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const column = canvas.getByRole("checkbox", {
      name: "Select all Approve in Project Management",
    });
    await userEvent.click(column);
    await expect(column).toBeChecked();
    for (const label of [
      "Approve — Daily Worksheet",
      "Approve — Task",
      "Approve — Issues and snags",
      "Approve — Inspection Request",
      "Approve — Equipment Usage",
    ])
      await expect(canvas.getByRole("checkbox", { name: label })).toBeChecked();
    // Other categories are untouched.
    await expect(
      canvas.getByRole("checkbox", { name: "Approve — Purchase Request" }),
    ).not.toBeChecked();
    await expect(
      canvas.getByRole("button", { name: /Project Management 5 granted/ }),
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Approve — Task" }),
    );
    await expect(column).not.toBeChecked();
    await userEvent.click(column);
    await expect(
      canvas.getByRole("checkbox", { name: "Approve — Task" }),
    ).toBeChecked();
    await userEvent.click(column);
    await expect(args.onChange).toHaveBeenLastCalledWith({});
  },
};

export const SelectsACategoryAndClearsAll: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select all in Others" }),
    );
    await expect(args.onChange).toHaveBeenLastCalledWith({
      "reporting.central_reports": ["read"],
    });
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select all in HRMS" }),
    );
    await expect(
      canvas.getByRole("checkbox", { name: "Select all in HRMS" }),
    ).toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "Clear all" }));
    await expect(args.onChange).toHaveBeenLastCalledWith({});
    await expect(canvas.getByText("0 permissions granted")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Clear all" }),
    ).toBeDisabled();
  },
};

export const SearchesAndCollapses: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /^Project Management/ }),
    );
    await waitFor(() =>
      expect(
        canvas.queryByRole("checkbox", { name: "Add — Task" }),
      ).not.toBeInTheDocument(),
    );

    await userEvent.type(canvas.getByLabelText("Search menus"), "purch");
    await expect(
      canvas.getByRole("checkbox", { name: "Add — Purchase Request" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("checkbox", { name: "Add — Purchase Order" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /^HRMS/ }),
    ).not.toBeInTheDocument();

    await userEvent.clear(canvas.getByLabelText("Search menus"));
    await userEvent.type(canvas.getByLabelText("Search menus"), "zzz");
    await expect(canvas.getByText("No menu matches “zzz”.")).toBeVisible();
  },
};

export const ReadOnly: Story = {
  args: {
    readOnly: true,
    initial: {
      "labour.attendance": ["create", "read", "update"],
      "site_work.daily_worksheet": ["create", "read"],
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    const cell = canvas.getByRole("checkbox", { name: "Add — Attendance" });
    await expect(cell).toBeChecked();
    await userEvent.click(cell);
    await expect(cell).toBeChecked();
    await expect(args.onChange).not.toHaveBeenCalled();
    await expect(
      canvas.queryByRole("button", { name: "Clear all" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("checkbox", { name: /^Select all/ }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("5 permissions granted")).toBeVisible();
  },
};
