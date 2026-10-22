import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SearchIcon } from "lucide-react";
import { expect } from "storybook/test";
import { Input } from "@repo/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { Label } from "@repo/ui/components/label";

/**
 * The shared text box. On hover a ring in the theme colour follows the
 * cursor. Stories can't hold a real `:hover`, so `Hovered` pins the ring on
 * with the cursor near the left end.
 */
const meta = {
  title: "UI/Input",
  component: Input,
  args: { placeholder: "example@example.com" },
  render: (args) => (
    <div className="w-80 space-y-2 p-6">
      <Label htmlFor="input-story">Email</Label>
      <Input id="input-story" {...args} />
    </div>
  ),
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const input = canvas.getByLabelText("Email");
    await userEvent.type(input, "prabhu@example.com");
    await expect(input).toHaveValue("prabhu@example.com");

    // The glow wrapper takes the cursor position without a re-render.
    const wrapper = canvasElement.querySelector<HTMLElement>(
      "[data-slot=input-glow]",
    );
    await expect(wrapper).not.toBeNull();
    const box = input.getBoundingClientRect();
    input.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: box.left + 40,
        clientY: box.top + 10,
      }),
    );
    await expect(wrapper?.style.getPropertyValue("--input-glow-x")).toMatch(
      /^40(\.\d+)?px$/,
    );
  },
};

export const Hovered: Story = {
  render: (args) => (
    <div className="w-80 space-y-2 p-6 [&_[data-slot=input-glow]]:[--input-glow-x:60px] [&_[data-slot=input-glow]]:[--input-glow-y:16px] [&_[data-slot=input-glow]>span]:opacity-100">
      <Label htmlFor="input-story">Email</Label>
      <Input id="input-story" {...args} />
    </div>
  ),
};

export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "prabhu@" },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "office@example.com" },
};

/** Width, flex and grid classes still size the box. */
export const Layout: Story = {
  render: () => (
    <div className="w-[32rem] space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Input aria-label="Narrow" className="h-8 w-40" />
        <Input aria-label="Grows" className="min-w-0 flex-1" />
      </div>
      <div data-testid="grid" className="grid grid-cols-2 gap-2">
        <Input aria-label="Spans" className="col-span-2 h-10" />
      </div>
      <div className="relative">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input aria-label="Search" className="h-10 pl-9" />
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Narrow").offsetWidth).toBe(160);
    await expect(canvas.getByLabelText("Grows").offsetWidth).toBeGreaterThan(
      200,
    );
    await expect(canvas.getByLabelText("Spans").offsetWidth).toBe(
      canvas.getByTestId("grid").clientWidth,
    );
  },
};

/** An input inside its own bordered box shows no second ring. */
export const InGroup: Story = {
  render: () => (
    <div className="w-80 p-6">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput aria-label="Search" placeholder="Search" />
      </InputGroup>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector("[data-slot=input-glow]"),
    ).toBeNull();
  },
};
