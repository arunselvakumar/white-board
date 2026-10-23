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

const courses = [
  { value: "dca", label: "DCA", tag: "6 months" },
  { value: "tally", label: "Tally Prime", tag: "3 months" },
  { value: "python", label: "Python", tag: "4 months" },
  { value: "ms-office", label: "MS Office", tag: "2 months" },
];

function CourseSelect({
  size,
  tags = false,
  defaultOpen,
  defaultValue = "tally",
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
  const id = `course-${size ?? "default"}`;
  return (
    <div className="grid w-64 gap-2">
      <Label htmlFor={id}>Course</Label>
      <Select
        items={courses}
        name="course"
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
          <SelectValue placeholder="Choose a Course" />
        </SelectTrigger>
        <SelectContent aria-label="Courses">
          {courses.map((course) => (
            <SelectItem
              key={course.value}
              value={course.value}
              tag={tags ? course.tag : undefined}
            >
              {course.label}
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
  component: CourseSelect,
  render: (args) => (
    <div className="p-6 pb-64">
      <CourseSelect {...args} />
    </div>
  ),
} satisfies Meta<typeof CourseSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

function pill() {
  const element = document.querySelector<HTMLElement>(
    "[data-slot=select-pill]",
  );
  if (element == null) throw new Error("No highlight pill");
  return element;
}

export const Open: Story = {
  args: { defaultOpen: true, tags: true },
  play: async () => {
    const listbox = await screen.findByRole("listbox", { name: "Courses" });
    const selected = screen.getByRole("option", { name: /Tally Prime/ });
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
    const trigger = screen.getByRole("combobox", { name: "Course" });
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
    const trigger = canvas.getByRole("combobox", { name: "Course" });
    await userEvent.click(trigger);
    await screen.findByRole("listbox", { name: "Courses" });

    // Pointer moves carry the pill to the row under the pointer.
    const python = screen.getByRole("option", { name: "Python" });
    await userEvent.hover(python);
    await waitFor(() =>
      expect(pill().style.transform).toBe(`translateY(${python.offsetTop}px)`),
    );

    await userEvent.click(python);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    await expect(trigger).toHaveTextContent("Python");
    // A pointer pick plays the label swap on the trigger.
    await expect(trigger).toHaveAttribute("data-swap");
  },
};

export const Keyboard: Story = {
  args: { defaultValue: "dca" },
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole("combobox", { name: "Course" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await screen.findByRole("listbox", { name: "Courses" });

    await userEvent.keyboard("{End}");
    const last = screen.getByRole("option", { name: "MS Office" });
    await waitFor(() => expect(last).toHaveAttribute("data-highlighted"));
    await waitFor(() =>
      expect(pill().style.transform).toBe(`translateY(${last.offsetTop}px)`),
    );

    await userEvent.keyboard("{Home}");
    await userEvent.keyboard("p");
    const python = screen.getByRole("option", { name: "Python" });
    await waitFor(() => expect(python).toHaveAttribute("data-highlighted"));

    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    await expect(trigger).toHaveTextContent("Python");
    await expect(trigger).not.toHaveAttribute("data-swap");

    await userEvent.keyboard("{ArrowDown}");
    await screen.findByRole("listbox", { name: "Courses" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    await expect(trigger).toHaveTextContent("Python");
  },
};

export const WithTags: Story = {
  args: { defaultOpen: true, tags: true, defaultValue: "python" },
  play: async () => {
    const python = await screen.findByRole("option", { name: /Python/ });
    const tag = python.querySelector<HTMLElement>(
      "[data-slot=select-item-tag]",
    );
    if (tag == null) throw new Error("No tag");
    await expect(tag).toHaveTextContent("4 months");
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
      <CourseSelect size="sm" />
      <CourseSelect />
      <CourseSelect size="lg" />
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
      canvas.getByRole("combobox", { name: "Course" }),
    ).toHaveTextContent("Choose a Course");
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("combobox", { name: "Course" }),
    ).toBeDisabled();
  },
};

export const Invalid: Story = {
  args: { invalid: true, defaultValue: null },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("combobox", { name: "Course" }),
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
        const value = data.get("course");
        event.currentTarget.setAttribute(
          "data-submitted",
          typeof value === "string" ? value : "",
        );
      }}
    >
      <CourseSelect />
      <Button type="submit" className="w-fit">
        Save
      </Button>
    </form>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Course" }));
    await userEvent.click(await screen.findByRole("option", { name: "DCA" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvasElement.querySelector("form")).toHaveAttribute(
      "data-submitted",
      "dca",
    );
  },
};
