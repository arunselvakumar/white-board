import { expect } from "@playwright/test";

import { createLocation, createProject } from "../api/projects";
import { companyTest } from "../helpers/companyTest";
import { InspectionPage } from "../pages/InspectionPage";

companyTest.describe("Inspections", () => {
  companyTest(
    "should raise a snag from the rejection, when the inspector rejects an Inspection Request",
    async ({ owner, page }) => {
      const project = await createProject(owner.api, {
        projectType: "infrastructure",
      });
      await createLocation(owner.api, project.id, "Culvert C3");

      const inspection = new InspectionPage(page, project.id);
      await inspection.goto();
      await inspection.choose("Inspector", owner.name);
      await inspection.form
        .getByLabel("Description of work")
        .fill("Slab reinforcement before the pour");
      await inspection.choose("Location", "Culvert C3");
      await inspection.form
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await expect(inspection.decision).toBeVisible();

      await inspection.decision.getByRole("button", { name: "Reject" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Reason").fill("Cover blocks missing");
      await dialog.getByRole("checkbox", { name: "Also raise a snag" }).check();
      await dialog.getByRole("button", { name: "Reject" }).click();

      const snag = inspection.main.getByRole("link", { name: /^ISS\// });
      await expect(snag).toBeVisible();
      await expect(inspection.main).toContainText("Cover blocks missing");
      await expect(inspection.link("Raise re-inspection")).toBeVisible();

      await snag.click();
      await expect(inspection.heading(/^ISS\//)).toBeVisible();
      await expect(inspection.main).toContainText("Cover blocks missing");
    },
  );

  companyTest(
    "should offer the new Issue Category on a new issue, when the Owner adds one in Masters",
    async ({ owner, page }) => {
      const project = await createProject(owner.api, {
        projectType: "infrastructure",
      });
      await page.goto("/app/masters/issue-categories");
      await page
        .getByRole("button", { name: "Add Issue Category" })
        .first()
        .click();
      await page
        .getByRole("dialog")
        .getByRole("textbox")
        .first()
        .fill("Waterproofing");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /^(Add|Save)$/ })
        .click();
      await expect(
        page.getByRole("main").getByText("Waterproofing", { exact: true }),
      ).toBeVisible();

      await page.goto(`/app/projects/${project.id}/issues/new`);
      await page.getByRole("combobox", { name: "Category" }).click();
      await expect(
        page.getByRole("option", { name: "Waterproofing" }),
      ).toBeVisible();
    },
  );
});
