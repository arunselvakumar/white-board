import { expect } from "@playwright/test";

import { createProject } from "../api/projects";
import { unique } from "../api/session";
import { buyPlan, planLimits } from "../api/subscription";
import { projectFormPageTest } from "../helpers/projectFormPageTest";

projectFormPageTest.describe("Plan limits", () => {
  projectFormPageTest(
    "should refuse a new Project with the plan's message, when the Company has used every Project its plan allows",
    { tag: ["@pr"] },
    async ({ projectFormPage, owner, page }) => {
      await buyPlan(owner.api, "basic");
      const limit = (await planLimits(owner.api))["project"] ?? 0;
      expect(limit).toBeGreaterThan(0);
      for (let index = 0; index < limit; index += 1)
        await createProject(owner.api);

      await projectFormPage.goto();
      await projectFormPage.fill({ name: unique("One Too Many") });
      await projectFormPage.addProjectButton.click();
      await expect(
        page.getByText(`Your plan allows ${String(limit)} Projects`),
      ).toBeVisible();
      await expect(page).toHaveURL(projectFormPage.url);
    },
  );
});
