import { expect } from "@playwright/test";

import { createLocation, createProject } from "../api/projects";
import { unique } from "../api/session";
import { FIXTURES } from "../fixtures";
import { projectTest } from "../helpers/projectTest";
import { IssuePage } from "../pages/IssuePage";
import { TaskPage } from "../pages/TaskPage";
import { addDays, todayInIndia } from "../api/dates";
import { createIssue, createTask } from "../api/tracking";

projectTest.describe("Tasks and Issues", () => {
  projectTest(
    "should show the Task In Progress at the percent reported, when the Owner adds a Task and updates its progress",
    { tag: ["@pr"] },
    async ({ project, page }) => {
      const name = unique("Ground floor columns");
      const addTask = new TaskPage(page, project.id);
      await addTask.goto();
      await addTask.form.getByLabel("Task name").fill(name);
      await addTask.form.getByRole("button", { name: "Save" }).click();
      await expect(addTask.heading(new RegExp(name))).toBeVisible();

      await addTask.updateProgress("40", "C1–C8 cast");
      await expect(addTask.summary).toContainText("In Progress");
      await expect(addTask.summary).toContainText("40");
      await expect(
        page.getByRole("list", { name: "Progress updates" }),
      ).toContainText("C1–C8 cast");

      await page.goto(`/app/projects/${project.id}/tasks`);
      await expect(page.getByRole("main").getByText(name)).toBeVisible();
    },
  );

  projectTest(
    "should close the issue, when the assignee posts a photo, marks it solved and the Owner verifies it",
    { tag: ["@pr"] },
    async ({ owner, newMember, page }) => {
      const project = await createProject(owner.api, {
        projectType: "infrastructure",
      });
      await createLocation(owner.api, project.id, "Pump house");
      const member = await newMember({
        roleName: "Site Engineer",
        projectIds: [project.id],
      });

      const newIssue = new IssuePage(page, project.id);
      await newIssue.goto();
      await newIssue.form
        .getByLabel("Details")
        .fill("Plaster cracks on the east wall");
      await newIssue.choose("Category", "Quality");
      await newIssue.choose("Assign To", member.name);
      await newIssue.choose("Location", "Pump house");
      await newIssue.form
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await expect(newIssue.number).toBeVisible();
      const issueUrl = new URL(page.url()).pathname;

      const memberPage = await member.page();
      const assigned = new IssuePage(
        memberPage,
        project.id,
        issueUrl.split(project.id)[1],
      );
      await assigned.goto();
      await assigned.postUpdate(
        "Cracks raked out and re-plastered.",
        FIXTURES.sitePhoto,
      );
      await expect(assigned.updates).toContainText(
        "Cracks raked out and re-plastered.",
      );
      await assigned.button("Mark As Solved").click();
      await expect(assigned.main).toContainText("Solved");

      await page.reload();
      await newIssue.button("Verify").click();
      await expect(newIssue.main).toContainText("Closed");
    },
  );

  projectTest(
    "should draw the dated Tasks on the Gantt chart, when the Owner opens Gantt",
    async ({ owner, project, page }) => {
      const task = await createTask(owner.api, {
        projectId: project.id,
        name: unique("Footings"),
        dueDate: addDays(todayInIndia(), 10),
      });
      await page.goto(`/app/projects/${project.id}/tasks`);
      await page.getByRole("tab", { name: "Gantt" }).click();
      const rows = page.getByRole("list", { name: "Gantt rows" });
      await expect(
        rows.getByRole("link", { name: new RegExp(task.name) }),
      ).toBeVisible();
    },
  );

  projectTest(
    "should reopen a closed issue with the reason, when the Owner finds the work redone badly",
    async ({ owner, page }) => {
      const project = await createProject(owner.api, {
        projectType: "infrastructure",
      });
      const location = await createLocation(
        owner.api,
        project.id,
        "Pump house",
      );
      const issue = await createIssue(owner.api, {
        projectId: project.id,
        issueDate: todayInIndia(),
        locationId: location.id,
      });

      const issuePage = new IssuePage(page, project.id, `/issues/${issue.id}`);
      await issuePage.goto();
      await issuePage.button("Mark As Solved").click();
      await issuePage.button("Verify").click();
      await expect(issuePage.main).toContainText("Closed");

      await issuePage.button("Reopen").click();
      const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog"));
      await dialog
        .getByRole("textbox")
        .first()
        .fill("Cracks are back after the rain");
      await dialog.getByRole("button", { name: "Reopen" }).click();
      await expect(issuePage.main).toContainText(
        "Cracks are back after the rain",
      );
      await expect(issuePage.button("Mark As Solved")).toBeVisible();
    },
  );
});
