import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Link from "next/link";
import { expect, within } from "storybook/test";

import { Fact, Section } from "./dashboard-parts";

const meta = {
  title: "Projects/Dashboard/Section",
  component: Section,
  args: {
    id: "dashboard-summary",
    title: "Project summary",
    children: (
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Fact label="Wings">2</Fact>
        <Fact label="Floors">18</Fact>
        <Fact label="Units">64</Fact>
        <Fact label="Drawings">12</Fact>
      </dl>
    ),
  },
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Open: the coloured icon, the title, the body and a − toggle. */
export const Open: Story = {
  play: async ({ canvas }) => {
    const region = within(
      canvas.getByRole("region", { name: "Project summary" }),
    );
    const toggle = region.getByRole("button", {
      name: "Collapse Project summary",
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveAttribute(
      "aria-controls",
      "dashboard-summary-body",
    );
    await expect(region.getByText("Floors")).toBeVisible();
    // The icon is decorative: the heading text stays the name.
    await expect(
      canvas.getByRole("heading", { level: 2 }).previousElementSibling,
    ).toHaveAttribute("aria-hidden", "true");
  },
};

/** Collapsed: only the header row stays, with a + toggle. */
export const Collapsed: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse Project summary" }),
    );
    const region = within(
      canvas.getByRole("region", { name: "Project summary" }),
    );
    const toggle = region.getByRole("button", {
      name: "Expand Project summary",
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(region.queryByText("Floors")).toBeNull();
  },
};

/**
 * With an aside (a link or filter): it sits left of the toggle and hides
 * while the section is collapsed. The toggle works from the keyboard.
 */
export const WithAside: Story = {
  args: {
    id: "dashboard-materials",
    title: "Materials",
    aside: (
      <Link
        href="/app/projects/kumari/materials/inventory/register"
        className="text-primary text-sm font-medium underline-offset-4 hover:underline"
      >
        Stock Register
      </Link>
    ),
  },
  play: async ({ canvas, userEvent }) => {
    const link = canvas.getByRole("link", { name: "Stock Register" });
    const toggle = canvas.getByRole("button", { name: "Collapse Materials" });
    await expect(
      link.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    await expect(
      canvas.queryByRole("link", { name: "Stock Register" }),
    ).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Expand Materials" }),
    ).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect(
      canvas.getByRole("link", { name: "Stock Register" }),
    ).toBeVisible();
  },
};

/** Dark mode: the chip and icon keep their hue. */
export const Dark: Story = {
  args: WithAside.args,
  globals: { theme: "dark" },
};
