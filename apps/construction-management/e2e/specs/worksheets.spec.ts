import { expect } from "@playwright/test";

import { createContractor } from "../api/masters";
import { createLocation, createProject } from "../api/projects";
import { createTask } from "../api/tracking";
import { projectTest } from "../helpers/projectTest";
import { TaskPage } from "../pages/TaskPage";
import { WorksheetPage } from "../pages/WorksheetPage";

projectTest.describe("Daily Worksheet", () => {
  projectTest(
    "should move the Task's progress, when a Daily Worksheet records work done against it",
    { tag: ["@pr"] },
    async ({ owner, page }) => {
      const project = await createProject(owner.api, {
        projectType: "infrastructure",
      });
      const location = await createLocation(
        owner.api,
        project.id,
        "Pump house",
      );
      const contractor = await createContractor(owner.api, {
        projectIds: [project.id],
      });
      const task = await createTask(owner.api, {
        projectId: project.id,
        contractorId: contractor.id,
        locationId: location.id,
        totalWorkQty: "100",
        unit: "sqm",
      });

      const worksheet = new WorksheetPage(page, project.id);
      await worksheet.goto();
      await worksheet.choose("Location", location.name);
      await worksheet.choose("Contractor", contractor.name);
      await worksheet.choose("Department", "Masonry & Plaster");
      await worksheet.chooseFirst("Work Shift");
      await worksheet.form
        .getByLabel("Skilled Labours", { exact: true })
        .fill("4");
      await worksheet.form
        .getByLabel("Unskilled Labours", { exact: true })
        .fill("6");
      await worksheet.form.getByLabel("Approx Work Done").fill("25");
      await worksheet.choose("Unit", /^sqm/);
      await worksheet.chooseTask(task.name);
      await worksheet.saveButton.click();
      await expect(page).not.toHaveURL(worksheet.url);

      const taskPage = new TaskPage(page, project.id, task.id);
      await taskPage.goto();
      await expect(taskPage.main).toContainText("In Progress");
      await expect(taskPage.main).toContainText("25 sqm of 100 sqm");
      await expect(taskPage.main).toContainText(/From Daily Worksheet WS\//);
    },
  );
});
