import { expect } from "@playwright/test";

import { unique } from "../api/session";
import { projectTest } from "../helpers/projectTest";
import { AddLabourPage } from "../pages/AddLabourPage";
import { MasterListPage } from "../pages/MasterListPage";

projectTest.describe("Masters", () => {
  projectTest(
    "should offer the new Labour Category and Supervisor on a Labour, when the Owner adds them",
    async ({ page }) => {
      const category = unique("Bar Bender");
      const supervisor = unique("Selvam");

      const categories = new MasterListPage(
        page,
        "/app/labour-categories",
        "Labour Categories",
      );
      await categories.goto();
      await categories.button("Add Labour Category").first().click();
      await categories.dialog.getByLabel("Labour Category name").fill(category);
      await categories.choose("Skill", "Skilled");
      await categories.dialog.getByRole("button", { name: "Save" }).click();
      await expect(categories.item(category)).toBeVisible();

      const supervisors = new MasterListPage(
        page,
        "/app/supervisors",
        "Supervisors",
      );
      await supervisors.goto();
      await supervisors.button("Add Supervisor").first().click();
      await supervisors.dialog.getByLabel("Supervisor name").fill(supervisor);
      await supervisors.dialog.getByRole("button", { name: "Save" }).click();
      await expect(supervisors.item(supervisor)).toBeVisible();

      const addLabourPage = new AddLabourPage(page);
      await addLabourPage.goto();
      await addLabourPage.choose("Labour Category", category);
      await addLabourPage.choose("Supervisor", supervisor);
      await expect(
        page.getByRole("combobox", { name: "Labour Category" }),
      ).toContainText(category);
      await expect(
        page.getByRole("combobox", { name: "Supervisor" }),
      ).toContainText(supervisor);
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
