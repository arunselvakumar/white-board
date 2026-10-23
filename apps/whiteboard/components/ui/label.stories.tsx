import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { FieldLegend, FieldSet } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";

const meta = {
  title: "UI/Label",
  component: Label,
  args: { required: false },
  render: (args) => (
    <div className="grid max-w-sm gap-2 p-6">
      <Label {...args} htmlFor="student-name">
        Student name
      </Label>
      <Input
        id="student-name"
        aria-required={args.required ? true : undefined}
        placeholder="Priya Raman"
      />
    </div>
  ),
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Optional: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("Student name");
    await expect(input).not.toHaveAttribute("aria-required");
    await expect(
      canvasElement.querySelector('[data-slot="required-indicator"]'),
    ).toBeNull();
  },
};

export const Required: Story = {
  args: { required: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The asterisk is CSS on an aria-hidden span: label text and accessible
    // name stay "Student name".
    const input = canvas.getByLabelText("Student name");
    await expect(canvas.getByRole("textbox", { name: "Student name" })).toBe(
      input,
    );
    await expect(input).toHaveAttribute("aria-required", "true");
    const indicator = canvasElement.querySelector(
      '[data-slot="required-indicator"]',
    );
    if (indicator == null) throw new Error("No required indicator");
    await expect(indicator).toHaveAttribute("aria-hidden", "true");
    await expect(indicator).toHaveClass("text-destructive");
    await expect(getComputedStyle(indicator, "::after").content).toBe('"*"');
  },
};

export const RequiredDark: Story = {
  args: { required: true },
  globals: { theme: "dark" },
};

export const RequiredGroup: Story = {
  render: () => (
    <FieldSet className="max-w-sm p-6">
      <FieldLegend variant="label" required>
        Class Mode
      </FieldLegend>
      <RadioGroup aria-label="Class Mode" aria-required defaultValue="offline">
        <div className="flex items-center gap-2">
          <RadioGroupItem id="mode-offline" value="offline" />
          <Label htmlFor="mode-offline" className="font-normal">
            Offline
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id="mode-online" value="online" />
          <Label htmlFor="mode-online" className="font-normal">
            Online
          </Label>
        </div>
      </RadioGroup>
    </FieldSet>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("radiogroup", { name: "Class Mode" }),
    ).toHaveAttribute("aria-required", "true");
    await expect(
      canvasElement.querySelector(
        'legend [data-slot="required-indicator"][aria-hidden="true"]',
      ),
    ).not.toBeNull();
  },
};
