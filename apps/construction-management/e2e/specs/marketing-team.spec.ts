import { expect } from "@playwright/test";

import { createProspectCompany } from "../api/marketing";
import { companyTest } from "../helpers/companyTest";
import { ProspectCompaniesPage } from "../pages/ProspectCompaniesPage";

companyTest.describe("Marketing Team", () => {
  companyTest(
    "should set a Marketing Person's monthly target and reassign their company to a colleague, when the Owner manages the Marketing Team",
    async ({ newMember, page }) => {
      const ravi = await newMember({ roleName: "Marketing" });
      const priya = await newMember({ roleName: "Marketing" });
      const company = await createProspectCompany(ravi.api);
      const companies = new ProspectCompaniesPage(page);

      await page.goto("/app/marketing/team");
      await expect(
        page.getByRole("link", { name: "Add Marketing Person" }),
      ).toHaveAttribute("href", /\/app\/staff\/office-staff\/new\?roleId=/);
      await page
        .getByRole("button", { name: `Set target for ${ravi.name}` })
        .first()
        .click();
      await companies.dialog.getByLabel("Visits a month").fill("15");
      await companies.clickAndWaitFor(
        companies.dialog.getByRole("button", { name: "Save" }),
        /\/target$/,
      );
      await expect(
        page.getByLabel(`${ravi.name}: 0 of 15 Visits`).first(),
      ).toBeVisible();

      await page.goto(`${companies.url}/${company.id}`);
      await companies.action("Reassign");
      await companies.choose("New Marketing Person", priya.name);
      await companies.clickAndWaitFor(
        companies.dialog.getByRole("button", { name: "Reassign" }),
        /\/reassign$/,
      );
      await expect(companies.main).toContainText(priya.name);
    },
  );
});
