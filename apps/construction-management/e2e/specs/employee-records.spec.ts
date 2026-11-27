import ExcelJS from "exceljs";
import { expect } from "@playwright/test";

import { createEmployee, todayInIndia } from "../api/labour";
import { createProject } from "../api/projects";
import { unique } from "../api/session";
import { employeesPageTest } from "../helpers/employeesPageTest";
import { EmployeeAttendancePage } from "../pages/EmployeeAttendancePage";
import { EmployeesPage } from "../pages/EmployeesPage";

employeesPageTest.describe("Employee records", () => {
  employeesPageTest(
    "should move the Employee and keep the history, when the Owner transfers them to another Project",
    async ({ employeesPage, owner, project }) => {
      const other = await createProject(owner.api, {
        name: unique("Kaveri Nagar"),
      });
      const employee = await createEmployee(owner.api, {
        projectId: project.id,
      });

      await employeesPage.goto();
      await employeesPage.rowAction(employee.name, "Transfer");
      await employeesPage.choose("To Project", other.name);
      await employeesPage.dialog
        .getByLabel("Transfer date")
        .fill(todayInIndia());
      await employeesPage.dialog
        .getByRole("button", { name: "Transfer" })
        .click();
      await expect(employeesPage.dialog).toHaveCount(0);
      await expect(employeesPage.row(employee.name)).toContainText(other.name);

      await employeesPage.rowAction(employee.name, "Transfer history");
      await expect(employeesPage.dialog).toContainText(project.name);
      await expect(employeesPage.dialog).toContainText(other.name);
    },
  );

  employeesPageTest(
    "should add every row on its Role, when the Owner imports Employees from the filled-in sample sheet",
    async ({ employeesPage, project, page }) => {
      const names = [unique("Murugan S"), unique("Selvi R")];

      await employeesPage.goto();
      await employeesPage.importButton.click();
      const download = page.waitForEvent("download");
      await employeesPage.dialog
        .getByRole("link", { name: "Download sample sheet" })
        .click();
      const sample = await (await download).path();

      const book = new ExcelJS.Workbook();
      await book.xlsx.readFile(sample);
      const sheet = book.worksheets[0];
      if (sheet == null) throw new Error("The sample has no sheet");
      const headers = (sheet.getRow(1).values as unknown[]).map(String);
      const column = (header: string) => headers.indexOf(header);
      for (const [index, name] of names.entries()) {
        const row = sheet.getRow(index + 2);
        row.values = [];
        row.getCell(column("Employee Name*")).value = name;
        row.getCell(column("Department")).value = "Human Resources";
        row.getCell(column("Role")).value =
          index === 0 ? "Labour" : "Site Engineer";
        row.getCell(column("Joining Date*")).value = todayInIndia(-5);
        row.getCell(column("Wage Type*")).value = "Daily";
        row.getCell(column("Wage per Day (₹)")).value = 750;
        row.getCell(column("Overtime Wage per Hour (₹)*")).value = 90;
        row.getCell(column("Projects")).value = project.name;
        row.commit();
      }
      const filled = Buffer.from(await book.xlsx.writeBuffer());

      await employeesPage.dialog.getByLabel("Choose Excel file").setInputFiles({
        name: "employees.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: filled,
      });
      await expect(
        employeesPage.dialog.getByRole("table", { name: "Import preview" }),
      ).toContainText(names[0] ?? "");
      await employeesPage.dialog
        .getByRole("button", { name: "Import 2 Employees" })
        .click();
      await expect(employeesPage.status("Imported 2 Employees.")).toBeVisible();
      await employeesPage.dialog.getByRole("button", { name: "Done" }).click();

      for (const name of names)
        await expect(employeesPage.row(name)).toContainText("₹750.00 / day");
      await expect(employeesPage.row(names[1] ?? "")).toContainText(
        "Site Engineer",
      );
    },
  );

  employeesPageTest(
    "should leave an inactive Employee off the attendance sheet, when the Owner deactivates them",
    async ({ owner, project, page }) => {
      const employee = await createEmployee(owner.api, {
        projectId: project.id,
      });
      const attendance = new EmployeeAttendancePage(page, project.id);
      await attendance.goto();
      await expect(
        attendance.statusButton(employee.name, "Present"),
      ).toBeVisible();

      const employees = new EmployeesPage(page);
      await employees.goto();
      await employees.rowAction(employee.name, "Deactivate");
      await page
        .getByRole("alertdialog", { name: `Deactivate ${employee.name}?` })
        .getByRole("button", { name: "Deactivate" })
        .click();
      await expect(employees.row(employee.name)).toContainText("Inactive");

      await attendance.goto();
      await expect(
        attendance.statusButton(employee.name, "Present"),
      ).toHaveCount(0);
    },
  );
});
