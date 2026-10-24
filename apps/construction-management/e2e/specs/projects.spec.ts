import { expect } from "@playwright/test";

import { unique } from "../api/session";
import { projectFormPageTest } from "../helpers/projectFormPageTest";
import { ProjectDashboardPage } from "../pages/ProjectDashboardPage";
import { ProjectsPage } from "../pages/ProjectsPage";

projectFormPageTest.describe("Projects", () => {
  projectFormPageTest(
    "should open the new Project's dashboard and list it on Projects, when the Owner adds a Project",
    { tag: ["@pr"] },
    async ({ projectFormPage, page }) => {
      const name = unique("Anugraha Residency");

      await projectFormPage.goto();
      await projectFormPage.fill({ name, colour: "Mint" });
      await projectFormPage.addressField.fill(
        "Plot 12, Saravanampatti, Coimbatore",
      );
      await projectFormPage.addProjectButton.click();

      await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]{36}/);
      const dashboard = new ProjectDashboardPage(page, "");
      await expect(dashboard.heading(name, { level: 1 })).toBeVisible();
      await expect(
        page.getByText("Step 2 of 2 · Assign resources"),
      ).toBeVisible();
      await dashboard.link("Skip").click();
      await expect(dashboard.figure("Project Type")).toHaveText("Residential");

      const projectsPage = new ProjectsPage(page);
      await projectsPage.goto();
      await expect(projectsPage.projectCard(name)).toBeVisible();
      await expect(projectsPage.statusFilter("Ongoing")).toContainText("1");
    },
  );

  projectFormPageTest(
    "should group Projects under their client, when a Project names a client",
    async ({ projectFormPage, page }) => {
      const name = unique("Kovai Heights");
      const client = unique("Sri Ganesh Developers");

      await projectFormPage.goto();
      await projectFormPage.fill({ name });
      await projectFormPage.openSection("Client");
      await projectFormPage.field("Client name").fill(client);
      await projectFormPage.addProjectButton.click();
      await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]{36}/);

      const projectsPage = new ProjectsPage(page);
      await projectsPage.goto();
      const group = projectsPage.clientGroup(client);
      await expect(group).toBeVisible();
      await expect(
        group.getByRole("link", { name: new RegExp(name) }),
      ).toBeVisible();
    },
  );
});
