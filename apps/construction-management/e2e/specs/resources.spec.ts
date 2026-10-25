import { expect } from "@playwright/test";

import { resourcesPageTest } from "../helpers/resourcesPageTest";
import { AmenitiesPage } from "../pages/AmenitiesPage";
import { ProjectsPage } from "../pages/ProjectsPage";

resourcesPageTest.describe("Project resources", () => {
  resourcesPageTest(
    "should let a member see the Project, when the Owner puts them on its Team Members",
    async ({ resourcesPage, project, newMember }) => {
      const member = await newMember({ roleName: "Site Engineer" });
      const memberPage = await member.page();
      const memberProjects = new ProjectsPage(memberPage);
      await memberProjects.goto();
      await expect(memberProjects.projectCard(project.name)).toHaveCount(0);

      await resourcesPage.goto();
      await resourcesPage.editButton("Team Members").click();
      await resourcesPage.dialog
        .getByRole("checkbox", { name: new RegExp(member.name) })
        .check();
      await resourcesPage.dialog.getByRole("button", { name: /Save/ }).click();
      await expect(resourcesPage.section("Team Members")).toContainText(
        member.name,
      );

      await memberProjects.goto();
      await expect(memberProjects.projectCard(project.name)).toBeVisible();
    },
  );

  resourcesPageTest(
    "should keep the ticked Amenities, when the Owner saves them",
    async ({ project, page }) => {
      const amenitiesPage = new AmenitiesPage(page, project.id);
      await amenitiesPage.goto();
      await amenitiesPage.option("Club House").check();
      await amenitiesPage.option("Compound Wall").check();
      await amenitiesPage.saveButton.click();
      await expect(amenitiesPage.saveButton).toBeDisabled();

      await page.reload();
      await expect(amenitiesPage.option("Club House")).toBeChecked();
      await expect(amenitiesPage.option("Compound Wall")).toBeChecked();
      await expect(amenitiesPage.option("Gymnasium")).not.toBeChecked();
    },
  );
});
