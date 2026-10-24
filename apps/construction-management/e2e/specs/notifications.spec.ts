import { expect } from "@playwright/test";

import { todayInIndia } from "../api/dates";
import { createLocation, createProject } from "../api/projects";
import { createIssue } from "../api/tracking";
import { companyTest } from "../helpers/companyTest";
import { ProjectsPage } from "../pages/ProjectsPage";

companyTest.describe("Notifications", () => {
  companyTest(
    "should ring the member's bell and mark it read, when the Owner assigns them an issue",
    { tag: ["@pr"] },
    async ({ owner, newMember }) => {
      const project = await createProject(owner.api, {
        projectType: "infrastructure",
      });
      const location = await createLocation(
        owner.api,
        project.id,
        "Pump house",
      );
      const member = await newMember({
        roleName: "Site Engineer",
        projectIds: [project.id],
      });

      const memberPage = await member.page();
      const shell = new ProjectsPage(memberPage);
      await shell.goto();
      await expect(shell.notificationsButton).toHaveAccessibleName(
        "Notifications",
      );

      await createIssue(owner.api, {
        projectId: project.id,
        issueDate: todayInIndia(),
        assigneeMemberId: member.id,
        locationId: location.id,
        details: "Seepage near the pump house wall",
      });

      await expect(async () => {
        await memberPage.reload();
        await expect(shell.notificationsButton).toHaveAccessibleName(
          "Notifications, 1 unread",
          { timeout: 2_000 },
        );
      }).toPass({ timeout: 30_000 });
      await shell.notificationsButton.click();
      const latest = memberPage.getByRole("list", {
        name: "Latest notifications",
      });
      await expect(latest).toContainText(/issue/i);

      await memberPage.goto("/app/notifications");
      const all = memberPage
        .getByRole("main")
        .getByRole("list", { name: "Notifications" });
      await all
        .getByRole("button", { name: /^Mark read: / })
        .first()
        .click();
      await expect(shell.notificationsButton).toHaveAccessibleName(
        "Notifications",
      );
    },
  );
});
