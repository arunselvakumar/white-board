import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import {
  humanResourcesGroups,
  marketingGroups,
  visibleDepartments,
  HUMAN_RESOURCES,
  MARKETING_DEPARTMENT,
} from "@/lib/departments-nav";
import { HRMS_SECTIONS } from "@/lib/hrms-nav";
import {
  FULL_MARKETING_ACCESS,
  MARKETING_SECTIONS,
  NO_MARKETING_ACCESS,
} from "@/lib/marketing-nav";
import { staffSections } from "@/lib/staff-nav";

import { DepartmentPage } from "./department-page";

const meta = {
  title: "App/Departments/DepartmentPage",
  component: DepartmentPage,
} satisfies Meta<typeof DepartmentPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The cards of a list, in order, by their names. */
function cardNames(list: HTMLElement) {
  return within(list)
    .getAllByRole("link")
    .map((link) => link.querySelector(".font-semibold")?.textContent);
}

/**
 * Human Resources (ADR CM-0046): Staff, then HRMS, a card per screen, each
 * a link with what the screen holds.
 */
export const HumanResources: Story = {
  args: {
    title: HUMAN_RESOURCES.label,
    meta: "Your people on site and in the office, and HRMS.",
    groups: humanResourcesGroups(true),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Human Resources", level: 1 }),
    ).toBeVisible();
    const staff = canvas.getByRole("region", { name: "Staff" });
    const hrms = canvas.getByRole("region", { name: "HRMS" });
    await expect(cardNames(staff)).toEqual(
      staffSections(true).map((section) => section.label),
    );
    await expect(cardNames(hrms)).toEqual(
      HRMS_SECTIONS.map((section) => section.label),
    );
    for (const section of [...staffSections(true), ...HRMS_SECTIONS]) {
      const card = within(
        section.href.startsWith("/app/hrms") ? hrms : staff,
      ).getByRole("link", { name: new RegExp(`^${section.label}`) });
      await expect(card).toHaveAttribute("href", section.href);
      await expect(card).toHaveTextContent(section.description);
    }
  },
};

/**
 * Without Team Members or Role Management Read (ADR CM-0030), Staff keeps
 * Labour, Site Engineer and Vendor.
 */
export const HumanResourcesWithoutStaffRoles: Story = {
  args: { ...HumanResources.args, groups: humanResourcesGroups(false) },
  play: async ({ canvas }) => {
    await expect(
      cardNames(canvas.getByRole("region", { name: "Staff" })),
    ).toEqual(["Labour", "Site Engineer", "Vendor"]);
    await expect(
      canvas.queryByRole("link", { name: /^Office Staff/ }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("link", { name: /^Role Management/ }),
    ).toBeNull();
  },
};

/** Marketing: one group, a card per entry. */
export const Marketing: Story = {
  args: {
    title: MARKETING_DEPARTMENT.label,
    meta: "Winning work: Visits, Follow-ups and Prospect Companies.",
    groups: marketingGroups(FULL_MARKETING_ACCESS),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Marketing", level: 1 }),
    ).toBeVisible();
    const cards = canvas.getByRole("region", { name: "Marketing" });
    await expect(cardNames(cards)).toEqual(
      MARKETING_SECTIONS.map((section) => section.label),
    );
    await expect(
      within(cards).getByRole("link", { name: /^Follow-ups/ }),
    ).toHaveAttribute("href", "/app/marketing/follow-ups");
  },
};

/** The Marketing Role (ADR CM-0040 §3): no Team, no Reports. */
export const MarketingRole: Story = {
  args: {
    ...Marketing.args,
    groups: marketingGroups({
      ...NO_MARKETING_ACCESS,
      dashboard: true,
      visits: true,
      followUps: true,
      companies: true,
    }),
  },
  play: async ({ canvas }) => {
    await expect(
      cardNames(canvas.getByRole("region", { name: "Marketing" })),
    ).toEqual(["Dashboard", "Visits", "Follow-ups", "Companies"]);
  },
};

/** Departments: a card per department the viewer may open. */
export const Departments: Story = {
  args: {
    title: "Departments",
    meta: "Your Company's departments and their screens.",
    groups: [
      {
        sections: visibleDepartments({
          canOpenStaffRoles: true,
          marketing: FULL_MARKETING_ACCESS,
        }).map(({ department }) => department),
      },
    ],
  },
  play: async ({ canvas }) => {
    const cards = canvas.getByRole("region", { name: "Departments" });
    await expect(cardNames(cards)).toEqual(["Human Resources", "Marketing"]);
    await expect(
      within(cards).getByRole("link", { name: /^Human Resources/ }),
    ).toHaveAttribute("href", HUMAN_RESOURCES.href);
  },
};
