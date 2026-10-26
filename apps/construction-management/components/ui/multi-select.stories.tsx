import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, within } from "storybook/test";

import { Label } from "@repo/ui/components/label";

import { MultiSelect, type MultiSelectOption } from "./multi-select";

const PROJECTS: MultiSelectOption[] = [
  { id: "p1", name: "Tower A" },
  { id: "p2", name: "Villa Phase 2" },
  { id: "p3", name: "Mall Block C" },
];

function ProjectsField({
  initial = [],
  onChange,
}: {
  initial?: string[];
  onChange: (ids: string[]) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="grid w-80 gap-2">
      <Label htmlFor="projects">Projects</Label>
      <MultiSelect
        id="projects"
        options={PROJECTS}
        value={value}
        onChange={(ids) => {
          setValue(ids);
          onChange(ids);
        }}
        placeholder="Search Projects"
        empty="No Projects found."
        listLabel="Projects"
      />
    </div>
  );
}

/**
 * Pick any number of records from a searchable list: a tick per chosen row
 * and a chip per chosen record. Projects on Add and Edit Labour use it.
 */
const meta = {
  title: "UI/Multi-select",
  component: ProjectsField,
  args: { onChange: fn() },
} satisfies Meta<typeof ProjectsField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TickSearchAndRemove: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole("combobox", { name: "Projects" });
    await expect(input).toHaveAttribute("placeholder", "Search Projects");

    await userEvent.click(input);
    await userEvent.click(await body.findByRole("option", { name: "Tower A" }));
    await expect(args.onChange).toHaveBeenLastCalledWith(["p1"]);
    await expect(body.getByRole("option", { name: "Tower A" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.type(input, "mall");
    await expect(
      body.queryByRole("option", { name: "Villa Phase 2" }),
    ).toBeNull();
    await userEvent.click(body.getByRole("option", { name: "Mall Block C" }));
    await expect(args.onChange).toHaveBeenLastCalledWith(["p1", "p3"]);
    // Tab leaves the field; Escape on a closed list would clear it.
    await userEvent.tab();
    await expect(args.onChange).toHaveBeenLastCalledWith(["p1", "p3"]);
    await expect(input).toHaveValue("");

    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Tower A" }),
    );
    await expect(args.onChange).toHaveBeenLastCalledWith(["p3"]);
    await expect(
      canvas.getByRole("button", { name: "Remove Mall Block C" }),
    ).toBeVisible();
  },
};

export const NothingFound: Story = {
  args: { initial: ["p2"] },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.getByRole("button", { name: "Remove Villa Phase 2" }),
    ).toBeVisible();
    await userEvent.type(
      canvas.getByRole("combobox", { name: "Projects" }),
      "warehouse",
    );
    await expect(await body.findByText("No Projects found.")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(args.onChange).not.toHaveBeenCalled();
    await expect(
      canvas.getByRole("button", { name: "Remove Villa Phase 2" }),
    ).toBeVisible();
  },
};
