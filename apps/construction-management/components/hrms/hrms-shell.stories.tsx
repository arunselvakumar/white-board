import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { HRMS_PATH, HRMS_SECTIONS } from "@/lib/hrms-nav";

import { HrmsComingSoon } from "./hrms-coming-soon";
import { HrmsShell } from "./hrms-shell";

function shellAt(href: string) {
  return {
    parameters: { nextjs: { navigation: { pathname: href } } },
    render: () => (
      <HrmsShell>
        <HrmsComingSoon href={href} />
      </HrmsShell>
    ),
  };
}

const meta = {
  title: "HRMS/Shell",
  component: HrmsShell,
} satisfies Meta<typeof HrmsShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {
  args: { children: null },
  ...shellAt(HRMS_PATH),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "HRMS" })).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /Back to Workspace/ }),
    ).toHaveAttribute("href", "/app/workspace");
    const sections = within(
      canvas.getByRole("navigation", { name: "HRMS sections" }),
    );
    for (const section of HRMS_SECTIONS)
      await expect(
        sections.getByRole("link", { name: section.label }),
      ).toHaveAttribute("href", section.href);
    await expect(
      sections.getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("aria-current", "page");
    // The Dashboard has one page, so no sub-tabs.
    await expect(
      canvas.queryByRole("navigation", { name: "Dashboard" }),
    ).toBeNull();
    await expect(canvas.getByText("Coming in this milestone")).toBeVisible();
  },
};

export const ConfigurationPage: Story = {
  args: { children: null },
  ...shellAt(`${HRMS_PATH}/configuration/holidays`),
  play: async ({ canvas }) => {
    const sections = within(
      canvas.getByRole("navigation", { name: "HRMS sections" }),
    );
    await expect(
      sections.getByRole("link", { name: "Configuration" }),
    ).toHaveAttribute("aria-current", "page");
    const pages = within(
      canvas.getByRole("navigation", { name: "Configuration" }),
    );
    const configuration = HRMS_SECTIONS.find(
      (section) => section.key === "configuration",
    );
    for (const page of configuration?.pages ?? [])
      await expect(
        pages.getByRole("link", { name: page.label }),
      ).toHaveAttribute("href", page.href);
    await expect(pages.getByRole("link", { name: "Holidays" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      canvas.getByRole("heading", { name: "Holidays" }),
    ).toBeVisible();
    await expect(canvas.getByText("Coming in this milestone")).toBeVisible();
  },
};
