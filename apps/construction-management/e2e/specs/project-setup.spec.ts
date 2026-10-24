import { expect } from "@playwright/test";

import { createProject } from "../api/projects";
import { unique } from "../api/session";
import { projectDashboardPageTest } from "../helpers/projectDashboardPageTest";
import { LocationsPage } from "../pages/LocationsPage";
import { ProjectFormPage } from "../pages/ProjectFormPage";
import { ProjectsPage } from "../pages/ProjectsPage";

projectDashboardPageTest.describe("Project setup", () => {
  projectDashboardPageTest(
    "should list the Locations in order, when the Owner divides an Infrastructure Project",
    async ({ owner, page }) => {
      const road = await createProject(owner.api, {
        name: unique("NH 544 Widening"),
        projectType: "infrastructure",
      });
      const locationsPage = new LocationsPage(page, road.id);
      await locationsPage.goto();
      await locationsPage.addLocation("Km 0 – Km 5");
      await locationsPage.addLocation("Km 5 – Km 10");

      const items = locationsPage.locations.getByRole("listitem");
      await expect(items).toHaveCount(2);
      await expect(items.nth(0)).toContainText("Km 0 – Km 5");
      await expect(items.nth(1)).toContainText("Km 5 – Km 10");
      await expect(locationsPage.projectNavLink("Wings")).toHaveCount(0);
    },
  );

  projectDashboardPageTest(
    "should drop a module from the Project menu, when the Owner hides it",
    async ({ projectDashboardPage }) => {
      await projectDashboardPage.goto();
      await expect(
        projectDashboardPage.projectNavLink("Hindrances"),
      ).toBeVisible();

      await projectDashboardPage.projectOptionsButton.click();
      await projectDashboardPage.menuItem("Hide / show modules").click();
      await projectDashboardPage.dialog
        .getByRole("checkbox", { name: "Hindrances", exact: true })
        .uncheck();
      await projectDashboardPage.dialog
        .getByRole("button", { name: "Save" })
        .click();
      await expect(projectDashboardPage.dialog).toHaveCount(0);

      await expect(
        projectDashboardPage.projectNavLink("Hindrances"),
      ).toHaveCount(0);
      await expect(
        projectDashboardPage.projectNavLink("Site Diary"),
      ).toBeVisible();
    },
  );

  projectDashboardPageTest(
    "should put the Project first on Projects, when the Owner pins it",
    async ({ projectDashboardPage, owner, project, page }) => {
      await createProject(owner.api, {
        name: unique("Aaa First Alphabetically"),
      });
      await projectDashboardPage.goto();
      await projectDashboardPage.projectOptionsButton.click();
      await projectDashboardPage.menuItem("Pin to top").click();

      const projectsPage = new ProjectsPage(page);
      await projectsPage.goto();
      await expect(
        projectsPage.main.getByRole("listitem").first(),
      ).toContainText(project.name);
    },
  );

  projectDashboardPageTest(
    "should keep the client and contract details, when the Owner edits the Project",
    async ({ project, page }) => {
      const form = new ProjectFormPage(page, project.id);
      await form.goto();
      await form.openSection("Client");
      await form.field("Client name").fill("Sri Ganesh Developers");
      await form.field("Client mobile").fill("9840012345");
      await form.saveButton.click();
      await expect(page).not.toHaveURL(form.url);

      await form.goto();
      await form.openSection("Client");
      await expect(form.field("Client name")).toHaveValue(
        "Sri Ganesh Developers",
      );
    },
  );
});
