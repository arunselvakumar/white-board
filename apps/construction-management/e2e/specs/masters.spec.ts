import { expect } from "@playwright/test";

import { todayInIndia } from "../api/dates";
import { PASSWORD, newMobile, unique } from "../api/session";
import { projectTest } from "../helpers/projectTest";
import { AddEmployeePage } from "../pages/AddEmployeePage";
import { EmployeesPage } from "../pages/EmployeesPage";
import { MasterListPage } from "../pages/MasterListPage";

projectTest.describe("Masters", () => {
  projectTest(
    "should offer the new Labour Category on an Employee and list a new Site Engineer who signs in, when the Owner adds them",
    async ({ page }) => {
      const category = unique("Bar Bender");
      const engineer = unique("Selvam");

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

      // Add Employee starts on Human Resources → Labour; a Site Engineer
      // is an Employee on that Role, and may sign in (ADR CM-0055).
      const employees = new EmployeesPage(page);
      await employees.goto();
      await employees.addEmployeeLink.first().click();
      const addEmployeePage = new AddEmployeePage(page);
      await expect(addEmployeePage.pageHeading).toBeVisible();
      await expect(addEmployeePage.departmentSelect).toContainText(
        "Human Resources",
      );
      await expect(addEmployeePage.roleSelect).toContainText("Labour");
      await expect(addEmployeePage.canSignInSwitch).not.toBeChecked();
      await addEmployeePage.fill({
        name: engineer,
        mobile: newMobile().slice(3),
        joiningDate: todayInIndia(-1),
        role: "Site Engineer",
        wagePerDay: "1200",
      });
      await addEmployeePage.canSignInSwitch.click();
      // They sign in with their mobile; nobody is invited (ADR CM-0053).
      await expect(addEmployeePage.mobileLoginCheckbox).toBeChecked();
      await addEmployeePage.passwordField.fill(PASSWORD);
      await addEmployeePage.saveButton.click();
      await expect(
        addEmployeePage.heading(`${engineer} can sign in now`),
      ).toBeVisible();
      await employees.goto();
      await expect(employees.row(engineer)).toContainText("Site Engineer");

      await addEmployeePage.goto();
      await addEmployeePage.choose("Labour Category", category);
      await expect(
        page.getByRole("combobox", { name: "Labour Category" }),
      ).toContainText(category);
      // Projects are set from the Project's Teams, not here.
      await expect(
        page.getByRole("combobox", { name: "Projects" }),
      ).toHaveCount(0);
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
