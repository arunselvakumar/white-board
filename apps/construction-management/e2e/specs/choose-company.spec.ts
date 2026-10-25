import { expect } from "@playwright/test";

import { createCompany } from "../api/organization";
import { createProject } from "../api/projects";
import { unique } from "../api/session";
import { chooseCompanyPageTest } from "../helpers/chooseCompanyPageTest";
import { ProjectsPage } from "../pages/ProjectsPage";
import { SignInPage } from "../pages/SignInPage";

chooseCompanyPageTest.describe("Choose Company", () => {
  chooseCompanyPageTest(
    "should show only the chosen Company's Projects, when a User of two Companies picks one and then switches",
    { tag: ["@pr"] },
    async ({ chooseCompanyPage, account, page }) => {
      const first = account.company;
      const firstProject = await createProject(account.api);
      const second = await createCompany(account.api, unique("Kaveri Infra"));
      const secondProject = await createProject(account.api);

      await new SignInPage(page).goto();
      await new SignInPage(page).signInByEmail(account.email, account.password);
      await expect(page).toHaveURL(chooseCompanyPage.url);
      await expect(chooseCompanyPage.company(first.name)).toBeVisible();
      await expect(chooseCompanyPage.company(second.name)).toBeVisible();
      await chooseCompanyPage.openButton(first.name).click();

      const projectsPage = new ProjectsPage(page);
      await expect(page).toHaveURL(projectsPage.url);
      await expect(projectsPage.companySwitcher).toContainText(first.name);
      await expect(projectsPage.projectCard(firstProject.name)).toBeVisible();
      await expect(projectsPage.projectCard(secondProject.name)).toHaveCount(0);

      await projectsPage.switchCompany(second.name);
      await expect(projectsPage.companySwitcher).toContainText(second.name);
      await expect(projectsPage.projectCard(secondProject.name)).toBeVisible();
      await expect(projectsPage.projectCard(firstProject.name)).toHaveCount(0);
    },
  );
});
