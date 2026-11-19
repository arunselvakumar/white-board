import { expect } from "@playwright/test";

import { createProspectCompany, createVisit } from "../api/marketing";
import { createProject } from "../api/projects";
import { marketingPageTest } from "../helpers/marketingPageTest";
import { MarketingPage } from "../pages/MarketingPage";
import { ProjectsPage } from "../pages/ProjectsPage";

marketingPageTest.describe("Marketing", () => {
  marketingPageTest(
    "should show Marketing with its four entries and open its Dashboard, when a member on the Marketing Role signs in",
    { tag: ["@pr", "@mobile"] },
    async ({ newMember }) => {
      const member = await newMember({ roleName: "Marketing" });
      const marketing = new MarketingPage(await member.page());

      await marketing.goto();
      await expect(
        marketing.heading("Marketing Dashboard", { level: 1 }),
      ).toBeVisible();
      await marketing.openSidebar();
      // On Marketing's pages the sidebar is Marketing's own menu, with the
      // entries the Role opens (ADR CM-0047).
      await expect(marketing.backToMainMenu).toHaveAttribute(
        "href",
        "/app/departments",
      );
      await expect(marketing.departmentMenu.getByRole("link")).toHaveText([
        "Dashboard",
        "Visits",
        "Follow-ups",
        "Companies",
      ]);
      await expect(
        marketing.departmentMenu.getByRole("link", { name: "Dashboard" }),
      ).toHaveAttribute("aria-current", "page");

      await marketing.currentPage.goto(marketing.departmentUrl);
      await expect(marketing.cards).toHaveCount(4);
      for (const name of ["Dashboard", "Visits", "Follow-ups", "Companies"])
        await expect(marketing.card(name)).toBeVisible();

      await marketing.currentPage.goto("/app/marketing/team");
      await expect(
        marketing.currentPage.getByText(
          "You don't have access to the Marketing Team",
        ),
      ).toBeVisible();
    },
  );

  marketingPageTest(
    "should leave Marketing out of the main menu, when a member's Role has no Marketing menu",
    async ({ owner, newMember }) => {
      const project = await createProject(owner.api);
      const member = await newMember({
        grants: { "projects.project": ["read"] },
        projectIds: [project.id],
      });
      const page = await member.page();
      const projects = new ProjectsPage(page);

      await projects.goto();
      await projects.openSidebar();
      await expect(projects.menuLink("Projects")).toBeVisible();
      await projects.mainMenu
        .getByRole("button", { name: "Show Departments list" })
        .click();
      await expect(projects.menuLink("Human Resources")).toBeVisible();
      await expect(projects.menuLink(/^Marketing$/)).toHaveCount(0);

      await page.goto("/app/departments/marketing");
      await expect(
        page.getByText("You don't have access to Marketing"),
      ).toBeVisible();
      await page.goto("/app/marketing");
      await expect(
        page.getByText("You don't have access to Marketing"),
      ).toBeVisible();
    },
  );

  marketingPageTest(
    "should show every Marketing entry as a card, when the Owner opens Marketing from Departments",
    async ({ marketingPage }) => {
      await marketingPage.currentPage.goto("/app/departments");
      await marketingPage.openSidebar();
      await marketingPage.departmentsSubmenu
        .getByRole("link", { name: "Marketing" })
        .click();
      await expect(marketingPage.currentPage).toHaveURL(
        marketingPage.departmentUrl,
      );
      // The sidebar swaps to Marketing's own menu (ADR CM-0047).
      await expect(marketingPage.backToMainMenu).toBeVisible();
      await expect(marketingPage.departmentMenu.getByRole("link")).toHaveCount(
        6,
      );
      await expect(marketingPage.cards).toHaveCount(6);
      for (const name of [
        "Dashboard",
        "Visits",
        "Follow-ups",
        "Companies",
        "Team",
        "Reports",
      ])
        await expect(marketingPage.card(name)).toBeVisible();
      await marketingPage.card("Visits").click();
      await expect(marketingPage.currentPage).toHaveURL(
        "/app/marketing/visits",
      );
      await expect(marketingPage.heading("Visits", { level: 1 })).toBeVisible();
    },
  );

  marketingPageTest(
    "should count a member's completed Visit on their Dashboard and show none for last month, when a member on the Marketing Role logs a Visit",
    { tag: ["@pr"] },
    async ({ newMember }) => {
      const member = await newMember({ roleName: "Marketing" });
      const company = await createProspectCompany(member.api, {
        primaryContact: { name: "Senthil Kumar" },
      });
      // A minute ago, so it falls in this month unless the month began in it.
      await createVisit(member.api, {
        prospectCompanyId: company.id,
        status: "completed",
        visitAt: new Date(Date.now() - 60 * 1000),
        contactIds: company.contactIds,
      });
      const marketing = new MarketingPage(await member.page());

      await marketing.goto();
      await expect(marketing.main).toContainText("Your figures");
      await expect(marketing.total("Visits completed")).toContainText(
        /Visits completed\s*1\s*In the period/,
      );
      await expect(
        marketing.currentPage.getByRole("combobox", {
          name: "Marketing Person",
        }),
      ).toHaveCount(0);

      await marketing.choose("Period", "Last month");
      await expect(marketing.currentPage).toHaveURL(/[?&]period=last_month/);
      await expect(marketing.total("Visits completed")).toContainText(
        /Visits completed\s*0\s*In the period/,
      );
    },
  );
});
