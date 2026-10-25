import { expect } from "@playwright/test";

import { executeSql, sqlText } from "../api/database";
import { buyPlan } from "../api/subscription";
import { FIXTURES } from "../fixtures";
import { settingsPageTest } from "../helpers/settingsPageTest";
import { ProjectFormPage } from "../pages/ProjectFormPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { SequenceIdsPage } from "../pages/SequenceIdsPage";
import { unique } from "../api/session";
import { addDays, todayInIndia } from "../api/dates";
import { createProject } from "../api/projects";
import { BackdatedEntryPage } from "../pages/BackdatedEntryPage";
import { SiteDiaryPage } from "../pages/SiteDiaryPage";

settingsPageTest.describe("Settings", () => {
  settingsPageTest(
    "should keep the GSTIN, PAN, address and logo, when the Owner saves the Company profile",
    async ({ settingsPage, page }) => {
      await settingsPage.goto();
      await settingsPage.gstinField.fill("33AAPFA0939F1ZM");
      await settingsPage.panField.fill("AAPFA0939F");
      await settingsPage.addressField.fill("12 Anna Salai, Chennai 600002");
      await settingsPage.saveChangesButton.click();
      await expect(settingsPage.status("Company profile saved.")).toBeVisible();

      await settingsPage.uploadLogo(FIXTURES.logo);
      await expect(settingsPage.logoImage).toBeVisible();

      await page.reload();
      await expect(settingsPage.gstinField).toHaveValue("33AAPFA0939F1ZM");
      await expect(settingsPage.panField).toHaveValue("AAPFA0939F");
      await expect(settingsPage.addressField).toHaveValue(
        "12 Anna Salai, Chennai 600002",
      );
      await expect(settingsPage.logoImage).toBeVisible();
    },
  );

  settingsPageTest(
    "should preview the next number with the new prefix, when the Owner adds a Sequence ID rule",
    async ({ page }) => {
      const sequenceIdsPage = new SequenceIdsPage(page);
      await sequenceIdsPage.goto();
      await sequenceIdsPage.addRuleButton.click();
      await sequenceIdsPage.prefixField.fill("ANU-PR");
      await expect(sequenceIdsPage.dialog.getByLabel("Preview")).toContainText(
        "ANU-PR",
      );
      await sequenceIdsPage.dialog
        .getByRole("button", { name: "Save rule" })
        .click();
      await expect(sequenceIdsPage.dialog).toHaveCount(0);
      await expect(sequenceIdsPage.main).toContainText("ANU-PR");
    },
  );

  settingsPageTest(
    "should show the plan-ended banner and refuse new Projects, when the Company's plan has ended",
    async ({ owner, page }) => {
      await buyPlan(owner.api, "basic");
      executeSql(`
        UPDATE construction_organization.subscriptions
        SET starts_at = now() - interval '40 days', ends_at = now() - interval '1 day'
        WHERE workspace_id = ${sqlText(owner.company.id)};
      `);

      const projectsPage = new ProjectsPage(page);
      await projectsPage.goto();
      await expect(
        page.getByText("Your plan has ended.").first(),
      ).toBeVisible();

      const projectFormPage = new ProjectFormPage(page);
      await projectFormPage.goto();
      await projectFormPage.fill({ name: unique("After Expiry") });
      await projectFormPage.addProjectButton.click();
      await expect(page.getByText(/Your plan has ended/).last()).toBeVisible();
      await expect(page).toHaveURL(projectFormPage.url);
    },
  );

  settingsPageTest(
    "should refuse a member's site diary dated before the back-dated limit, when the Owner sets one",
    async ({ owner, newMember, page }) => {
      const project = await createProject(owner.api);
      const backdated = new BackdatedEntryPage(page);
      await backdated.goto();
      await backdated.createLimitField.fill("3");
      await backdated.button("Save changes").click();
      await expect(backdated.status(/saved/i)).toBeVisible();

      const member = await newMember({
        grants: {
          "projects.project": ["read"],
          "site_work.site_diary": ["create", "read", "update"],
        },
        projectIds: [project.id],
      });
      const memberPage = await member.page();
      const diary = new SiteDiaryPage(memberPage, project.id);
      await diary.goto();
      await diary.form.getByLabel("Date").fill(addDays(todayInIndia(), -10));
      await diary.form.getByLabel("Notes").fill("Catching up on last week");
      await diary.form
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await expect(diary.form).toContainText(/older than|back-dated|3 days/i);
      await expect(memberPage).toHaveURL(diary.url);
    },
  );
});
