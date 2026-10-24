import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, waitFor } from "storybook/test";

import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

const units = [
  { value: "bags", label: "Bags", tag: "cement" },
  { value: "cubic-metres", label: "Cubic metres", tag: "sand" },
  { value: "tonnes", label: "Tonnes", tag: "steel" },
  { value: "numbers", label: "Numbers", tag: "bricks" },
];

function UnitSelect({
  size,
  tags = false,
  defaultOpen,
  defaultValue = "cubic-metres",
  disabled,
  invalid,
}: {
  size?: "sm" | "default" | "lg";
  tags?: boolean;
  defaultOpen?: boolean;
  defaultValue?: string | null;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const id = `unit-${size ?? "default"}`;
  return (
    <div className="grid w-64 gap-2">
      <Label htmlFor={id}>Unit</Label>
      <Select
        items={units}
        name="unit"
        defaultValue={defaultValue}
        defaultOpen={defaultOpen}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          size={size}
          className="w-full"
          aria-invalid={invalid ? true : undefined}
        >
          <SelectValue placeholder="Choose a unit" />
        </SelectTrigger>
        <SelectContent aria-label="Units">
          {units.map((unit) => (
            <SelectItem
              key={unit.value}
              value={unit.value}
              tag={tags ? unit.tag : undefined}
            >
              {unit.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * The shared Select, animated like React Bits' Glide Select: the menu pops
 * out of the trigger's corner and one highlight pill glides between rows.
 * Story tests run with motion off, so they check where things land, not how
 * they move.
 */
const meta = {
  title: "UI/Select",
  component: UnitSelect,
  render: (args) => (
    <div className="p-6 pb-64">
      <UnitSelect {...args} />
    </div>
  ),
} satisfies Meta<typeof UnitSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

function pill() {
  const element = document.querySelector<HTMLElement>(
    "[data-slot=select-pill]",
  );
  if (element == null) throw new Error("No highlight pill");
  return element;
}

/**
 * Presses `key` until `option` is highlighted. On a busy runner the open
 * list sometimes drops a key even after it has focus; each of these keys
 * lands on the same row when pressed again.
 */
async function pressUntilHighlighted(
  userEvent: { keyboard: (text: string) => Promise<void> },
  key: string,
  option: HTMLElement,
) {
  await userEvent.keyboard(key);
  await waitFor(async () => {
    if (!option.hasAttribute("data-highlighted")) await userEvent.keyboard(key);
    await expect(option).toHaveAttribute("data-highlighted");
  });
}

export const Open: Story = {
  args: { defaultOpen: true, tags: true },
  play: async () => {
    const listbox = await screen.findByRole("listbox", { name: "Units" });
    const selected = screen.getByRole("option", { name: /Cubic metres/ });
    await expect(selected).toHaveAttribute("aria-selected", "true");

    // The pill opens on the selected row, at the row's height.
    await waitFor(() => expect(pill().style.opacity).toBe("1"));
    await expect(pill().style.transform).toBe(
      `translateY(${selected.offsetTop}px)`,
    );
    await expect(selected.offsetHeight).toBe(30);
    await expect(listbox).toHaveAttribute("data-live");

    // Menu: 176 px wide, 6 px below the trigger, from its top-left corner.
    const popup = listbox.closest<HTMLElement>("[data-slot=select-content]");
    if (popup == null) throw new Error("No popup");
    await expect(popup).toHaveAttribute("data-side", "bottom");
    await expect(popup).toHaveAttribute("data-align", "start");
    await expect(getComputedStyle(popup).transformOrigin).toBe("0px 0px");
    const trigger = screen.getByRole("combobox", { name: "Unit" });
    await expect(
      Math.round(
        popup.getBoundingClientRect().top -
          trigger.getBoundingClientRect().bottom,
      ),
    ).toBe(6);
  },
};

export const OpenDark: Story = {
  args: { defaultOpen: true, tags: true },
  globals: { theme: "dark" },
};

export const PointerPick: Story = {
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("combobox", { name: "Unit" });
    await userEvent.click(trigger);
    await screen.findByRole("listbox", { name: "Units" });

    // Pointer moves carry the pill to the row under the pointer.
    const tonnes = screen.getByRole("option", { name: "Tonnes" });
    await userEvent.hover(tonnes);
    await waitFor(() =>
      expect(pill().style.transform).toBe(`translateY(${tonnes.offsetTop}px)`),
    );

    await userEvent.click(tonnes);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    await expect(trigger).toHaveTextContent("Tonnes");
    // A pointer pick plays the label swap on the trigger.
    await expect(trigger).toHaveAttribute("data-swap");
  },
};

export const Keyboard: Story = {
  args: { defaultValue: "bags" },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("combobox", { name: "Unit" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await screen.findByRole("listbox", { name: "Units" });

    const last = screen.getByRole("option", { name: "Numbers" });
    await pressUntilHighlighted(userEvent, "{End}", last);
    await waitFor(() =>
      expect(pill().style.transform).toBe(`translateY(${last.offsetTop}px)`),
    );

    await pressUntilHighlighted(
      userEvent,
      "{Home}",
      screen.getByRole("option", { name: "Bags" }),
    );
    // Tonnes is the only unit starting with "t", so typing it again is safe.
    const tonnes = screen.getByRole("option", { name: "Tonnes" });
    await pressUntilHighlighted(userEvent, "t", tonnes);

    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    await expect(trigger).toHaveTextContent("Tonnes");
    await expect(trigger).not.toHaveAttribute("data-swap");

    await userEvent.keyboard("{ArrowDown}");
    await screen.findByRole("listbox", { name: "Units" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    await expect(trigger).toHaveTextContent("Tonnes");
  },
};

export const WithTags: Story = {
  args: { defaultOpen: true, tags: true, defaultValue: "tonnes" },
  play: async () => {
    const tonnes = await screen.findByRole("option", { name: /Tonnes/ });
    const tag = tonnes.querySelector<HTMLElement>(
      "[data-slot=select-item-tag]",
    );
    if (tag == null) throw new Error("No tag");
    await expect(tag).toHaveTextContent("steel");
    // Tag text is 2 px smaller than the row.
    await expect(getComputedStyle(tag).fontSize).toBe("11px");
    // The check shows on the selected row only.
    const checks = [...document.querySelectorAll("[data-slot=select-item]")]
      .map((row) => row.querySelector("svg"))
      .map((svg) => (svg ? getComputedStyle(svg).visibility : null));
    await expect(checks).toEqual(["hidden", "hidden", "visible", "hidden"]);
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="grid gap-4 p-6">
      <UnitSelect size="sm" />
      <UnitSelect />
      <UnitSelect size="lg" />
    </div>
  ),
  play: async ({ canvas }) => {
    const heights = canvas
      .getAllByRole("combobox")
      .map((trigger) => trigger.offsetHeight);
    await expect(heights).toEqual([28, 32, 40]);
  },
};

export const Placeholder: Story = {
  args: { defaultValue: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("combobox", { name: "Unit" }),
    ).toHaveTextContent("Choose a unit");
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("combobox", { name: "Unit" })).toBeDisabled();
  },
};

export const Invalid: Story = {
  args: { invalid: true, defaultValue: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("combobox", { name: "Unit" }),
    ).toHaveAttribute("aria-invalid", "true");
  },
};

export const InForm: Story = {
  render: () => (
    <form
      className="grid gap-4 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const value = data.get("unit");
        event.currentTarget.setAttribute(
          "data-submitted",
          typeof value === "string" ? value : "",
        );
      }}
    >
      <UnitSelect />
      <Button type="submit" className="w-fit">
        Save
      </Button>
    </form>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Unit" }));
    await userEvent.click(await screen.findByRole("option", { name: "Bags" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvasElement.querySelector("form")).toHaveAttribute(
      "data-submitted",
      "bags",
    );
  },
};
