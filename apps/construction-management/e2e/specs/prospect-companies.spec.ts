import { expect } from "@playwright/test";
import ExcelJS from "exceljs";

import { createProspectCompany } from "../api/marketing";
import { unique } from "../api/session";
import { companyTest } from "../helpers/companyTest";
import { ProjectFormPage } from "../pages/ProjectFormPage";
import { ProspectCompaniesPage } from "../pages/ProspectCompaniesPage";

companyTest.describe("Prospect Companies", () => {
  companyTest(
    "should add a Prospect Company with its primary Contact and move it to Lost with a reason, when a member on the Marketing Role uses Companies",
    { tag: ["@pr", "@mobile"] },
    async ({ newMember }) => {
      const member = await newMember({ roleName: "Marketing" });
      const companies = new ProspectCompaniesPage(await member.page());
      const name = unique("Anugraha Steel");

      await companies.goto();
      await companies.link("Add Prospect Company").first().click();
      await companies.field("Name").fill(name);
      await companies.field("City").fill("Coimbatore");
      await companies.field("Contact name").fill("Ravi Kumar");
      await companies.field("Contact mobile").fill("98765 43210");
      await companies.clickAndWaitFor(
        companies.button("Save"),
        "/api/construction/marketing/companies",
      );

      await expect(companies.heading(name, { level: 1 })).toBeVisible();
      await expect(companies.contacts).toContainText("Ravi Kumar");
      await expect(companies.contacts).toContainText("Primary");
      await expect(companies.history).toContainText("Added at New");

      await companies.action("Move Stage");
      await companies.dialog.getByRole("radio", { name: "Lost" }).click();
      await companies.choose("Lost Reason", "Other");
      await companies.dialog
        .getByLabel("Why was it lost?")
        .fill("Project shelved");
      await companies.clickAndWaitFor(
        companies.dialog.getByRole("button", { name: "Move" }),
        /\/stage$/,
      );
      await expect(
        companies.history.getByRole("listitem").first(),
      ).toContainText("Moved to Lost");
      await expect(companies.main).toContainText("Project shelved");

      // The member did not get delete with the Marketing Role.
      await companies.button("Actions").click();
      await expect(companies.menuItem("Delete")).toHaveCount(0);
    },
  );

  companyTest(
    "should list only a member's own Prospect Companies and not a colleague's, when the Role has no View all",
    async ({ newMember }) => {
      const ravi = await newMember({ roleName: "Marketing" });
      const priya = await newMember({ roleName: "Marketing" });
      const ravis = await createProspectCompany(ravi.api, {
        name: unique("Kaveri Steel"),
      });
      const priyas = await createProspectCompany(priya.api, {
        name: unique("Pandian Mills"),
      });
      const companies = new ProspectCompaniesPage(await ravi.page());

      await companies.goto();
      await expect(companies.list).toContainText(ravis.name);
      await expect(companies.list).not.toContainText(priyas.name);

      await companies.currentPage.goto(`${companies.url}/${priyas.id}`);
      await expect(
        companies.main.getByText("This Prospect Company was not found"),
      ).toBeVisible();
      await expect(companies.heading(priyas.name)).toHaveCount(0);
    },
  );

  companyTest(
    "should find a Prospect Company by its Contact's mobile and refuse a second company with the same name, when the Owner searches and adds",
    async ({ owner, page }) => {
      const kaveri = await createProspectCompany(owner.api, {
        name: unique("Kaveri Steel"),
        primaryContact: { name: "Lakshmi", mobile: "9840012345" },
      });
      await createProspectCompany(owner.api, { name: unique("Pandian Mills") });
      const companies = new ProspectCompaniesPage(page);

      await companies.goto();
      await companies.search.fill("98400 12345");
      await expect(companies.list).toContainText(kaveri.name);
      await expect(companies.list).not.toContainText("Pandian Mills");

      await companies.link("Add Prospect Company").first().click();
      await companies.field("Name").fill(kaveri.name.toUpperCase());
      await companies.button("Save").click();
      await expect(
        companies.main.getByText(
          "A Prospect Company with this name already exists.",
        ),
      ).toBeVisible();
    },
  );

  companyTest(
    "should open New Project with the client name filled in and list the saved Project on the company, when the Owner wins a Prospect Company and creates its Project",
    async ({ owner, page }) => {
      const company = await createProspectCompany(owner.api, {
        name: unique("Madurai Steel Structures"),
      });
      const project = unique("Kappalur PEB Plant");
      const companies = new ProspectCompaniesPage(page);

      await page.goto(`${companies.url}/${company.id}`);
      await expect(companies.heading(company.name, { level: 1 })).toBeVisible();
      await companies.action("Move Stage");
      await companies.dialog.getByRole("radio", { name: "Won" }).click();
      await companies.clickAndWaitFor(
        companies.dialog.getByRole("button", { name: "Move" }),
        /\/stage$/,
      );
      await expect(
        companies.projects.getByText("No Projects for this client yet."),
      ).toBeVisible();

      await companies.projects
        .getByRole("link", { name: "Create Project" })
        .click();
      await expect(page).toHaveURL(/\/app\/projects\/new\?clientName=/);
      const form = new ProjectFormPage(page);
      await expect(form.field("Client name")).toHaveValue(company.name);
      await form.fill({ name: project });
      await form.addProjectButton.click();
      await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]{36}/);

      await page.goto(`${companies.url}/${company.id}`);
      await expect(
        companies.projects.getByRole("link", { name: project }),
      ).toBeVisible();
    },
  );

  companyTest(
    "should add the new companies and report the duplicate, when the Owner imports Prospect Companies from the Excel template",
    async ({ owner, page }) => {
      const live = await createProspectCompany(owner.api, {
        name: unique("Sri Balaji Builders"),
      });
      const names = [unique("Kaveri Steel"), unique("Pandian Mills")];
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("Prospect Companies");
      sheet.addRow([
        "Name",
        "City",
        "Phone",
        "Primary Contact name",
        "Primary Contact mobile",
      ]);
      sheet.addRow([names[0], "Salem", null, "Lakshmi", "98400 12345"]);
      sheet.addRow([live.name.toUpperCase(), "Chennai"]);
      sheet.addRow([names[1], "Madurai"]);
      const filled = Buffer.from(await book.xlsx.writeBuffer());
      const companies = new ProspectCompaniesPage(page);

      await companies.goto();
      await companies.button("Import").click();
      await companies.upload("Choose Excel file", {
        name: "prospect-companies.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: filled,
      });
      await companies.clickAndWaitFor(
        companies.dialog.getByRole("button", { name: "Import" }),
        "/api/construction/marketing/companies/import",
      );
      await expect(
        companies.status("Added 2 Prospect Companies. 1 duplicate not added."),
      ).toBeVisible();
      const notImported = companies.dialog.getByRole("table", {
        name: "Rows not imported",
      });
      await expect(notImported).toContainText(live.name.toUpperCase());
      await expect(notImported).toContainText(
        "A Prospect Company with this name already exists.",
      );
      await companies.dialog.getByRole("button", { name: "Done" }).click();

      for (const name of names)
        await expect(companies.list).toContainText(name);
    },
  );
});
