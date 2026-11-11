import { expect } from "@playwright/test";

import { createLabour } from "../api/labour";
import { resourcesPageTest } from "../helpers/resourcesPageTest";
import { AmenitiesPage } from "../pages/AmenitiesPage";
import { LabourPage } from "../pages/LabourPage";
import { ProjectActivityPage } from "../pages/ProjectActivityPage";
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

  resourcesPageTest(
    "should show a Labour in both Activity feeds, when the Owner adds them on the Project's Resources",
    { tag: ["@pr"] },
    async ({ resourcesPage, project, owner, page }) => {
      const labour = await createLabour(owner.api, { projectId: null });

      await resourcesPage.goto();
      await resourcesPage.addLabours([labour.name], "Slab work");
      await expect(resourcesPage.section("Labours")).toContainText(labour.name);

      const projectActivity = new ProjectActivityPage(page, project.id);
      await projectActivity.goto();
      const today = projectActivity.day("Today");
      await expect(today).toContainText(`${labour.name} added`);
      await expect(today).toContainText("Slab work");

      const labourPage = new LabourPage(page, labour.id);
      await labourPage.goto();
      await labourPage.tab("Activity").click();
      await expect(page).toHaveURL(/[?&]tab=activity/);
      await expect(labourPage.day("Today")).toContainText(
        `Added to ${project.name}`,
      );
    },
  );
});
