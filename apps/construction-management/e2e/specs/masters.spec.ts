import { expect } from "@playwright/test";

import { PASSWORD, newMobile, unique } from "../api/session";
import { projectTest } from "../helpers/projectTest";
import { AddLabourPage } from "../pages/AddLabourPage";
import { AddSiteEngineerPage } from "../pages/AddSiteEngineerPage";
import { MasterListPage } from "../pages/MasterListPage";

projectTest.describe("Masters", () => {
  projectTest(
    "should offer the new Labour Category on a Labour and list the new Site Engineer, when the Owner adds them",
    async ({ page }) => {
      const category = unique("Bar Bender");
      const supervisor = unique("Selvam");

      const categories = new MasterListPage(
        page,
        "/app/masters/labour-categories",
        "Labour Categories",
      );
      // The old Human Resources address redirects here (ADR CM-0035).
      await page.goto("/app/labour-categories");
      await expect(page).toHaveURL(/\/app\/masters\/labour-categories$/);
      await expect(categories.pageHeading).toBeVisible();
      await categories.button("Add Labour Category").first().click();
      await categories.dialog.getByLabel("Labour Category name").fill(category);
      await categories.choose("Skill", "Skilled");
      await categories.dialog.getByRole("button", { name: "Save" }).click();
      await expect(categories.item(category)).toBeVisible();

      const supervisors = new MasterListPage(
        page,
        "/app/staff/site-engineers",
        "Site Engineers",
      );
      await supervisors.goto();
      // A page of its own, and every new Site Engineer signs in (ADR CM-0037).
      await page
        .getByRole("link", { name: "Add Site Engineer" })
        .first()
        .click();
      const addSiteEngineerPage = new AddSiteEngineerPage(page);
      await expect(addSiteEngineerPage.pageHeading).toBeVisible();
      await addSiteEngineerPage.fillDetails({
        name: supervisor,
        mobile: newMobile().slice(3),
        password: PASSWORD,
      });
      await addSiteEngineerPage.button("Add Site Engineer").click();
      await expect(
        addSiteEngineerPage.heading(`${supervisor} can sign in now`),
      ).toBeVisible();
      await supervisors.goto();
      await expect(supervisors.item(supervisor)).toBeVisible();

      const addLabourPage = new AddLabourPage(page);
      await addLabourPage.goto();
      await addLabourPage.choose("Labour Category", category);
      await expect(
        page.getByRole("combobox", { name: "Labour Category" }),
      ).toContainText(category);
      // A Labour answers to the Site Engineers on their Projects; there is
      // no Site Engineer to pick (ADR CM-0041).
      await expect(
        page.getByRole("combobox", { name: "Site Engineer" }),
      ).toHaveCount(0);
      await expect(
        page.getByText("They answer to the Site Engineers on their Projects."),
      ).toBeVisible();
    },
  );

  projectTest(
    "should list the Supplier with its GSTIN and the Material with its unit, when the Owner adds them",
    async ({ page }) => {
      const supplier = unique("Sri Balaji Cements");
      const material = unique("OPC 53 Grade Cement");

      const suppliersForm = new MasterListPage(
        page,
        "/app/masters/suppliers/new",
        "Add Supplier",
      );
      await suppliersForm.goto();
      await suppliersForm.field("Supplier name").fill(supplier);
      await suppliersForm.field("GSTIN").fill("33AAPFA0939F1ZM");
      await suppliersForm.field("PAN").fill("AAPFA0939F");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const suppliers = new MasterListPage(
        page,
        "/app/masters/suppliers",
        "Suppliers",
      );
      await expect(page).toHaveURL(/\/app\/masters\/suppliers/);
      await suppliers.goto();
      await expect(suppliers.main.getByText(supplier)).toBeVisible();

      await page.goto("/app/masters/materials/new");
      const materials = new MasterListPage(
        page,
        "/app/masters/materials",
        "Materials",
      );
      await materials.field("Material name").fill(material);
      await materials.choose("Measurement Unit", /^Bag/);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/masters\/materials/);
      await materials.goto();
      await expect(materials.main.getByText(material)).toBeVisible();
    },
  );
});
