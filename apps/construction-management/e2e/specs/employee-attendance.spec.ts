import { expect } from "@playwright/test";

import {
  createEmployee,
  markEmployeeAttendance,
  todayInIndia,
} from "../api/labour";
import { employeeAttendancePageTest } from "../helpers/employeeAttendancePageTest";
import { WagesPage } from "../pages/WagesPage";

employeeAttendancePageTest.describe("Employee attendance", () => {
  employeeAttendancePageTest(
    "should owe the day's wage, when the Owner marks an Employee on the Project Present",
    { tag: ["@pr", "@mobile"] },
    async ({ owner, project, employeeAttendancePage, page }) => {
      const employee = await createEmployee(owner.api, {
        projectId: project.id,
        wagePerDayRupees: 850,
        joiningDate: todayInIndia(-10),
      });
      await employeeAttendancePage.goto();
      // Each row names the Employee's Role (ADR CM-0055 §5).
      await expect(
        employeeAttendancePage.form
          .getByRole("listitem", { name: employee.name })
          .getByText(/^Labour · /),
      ).toBeVisible();
      await employeeAttendancePage
        .statusButton(employee.name, "Present")
        .click();
      await employeeAttendancePage.saveButton.click();
      await expect(employeeAttendancePage.summary).toContainText("1 saved");
      await expect(employeeAttendancePage.summary).toContainText("₹850.00");

      const wagesPage = new WagesPage(page, project.id);
      await wagesPage.goto();
      await expect(wagesPage.amount(employee.name, "To Pay")).toHaveText(
        "₹850.00",
      );
      await expect(wagesPage.amount(employee.name, "Final Amount")).toHaveText(
        "₹850.00",
      );
    },
  );

  employeeAttendancePageTest(
    "should owe half the wage, when an Employee is marked Half Day",
    async ({ owner, project, employeeAttendancePage, page }) => {
      const employee = await createEmployee(owner.api, {
        projectId: project.id,
        wagePerDayRupees: 900,
      });
      await employeeAttendancePage.goto();
      await employeeAttendancePage
        .statusButton(employee.name, "Half Day")
        .click();
      await employeeAttendancePage.saveButton.click();
      await expect(employeeAttendancePage.summary).toContainText("₹450.00");

      const wagesPage = new WagesPage(page, project.id);
      await wagesPage.goto();
      await expect(wagesPage.amount(employee.name, "To Pay")).toHaveText(
        "₹450.00",
      );
    },
  );

  employeeAttendancePageTest(
    "should clear the balance, when the Owner pays an Employee what they are owed",
    { tag: ["@pr"] },
    async ({ owner, project, page }) => {
      const employee = await createEmployee(owner.api, {
        projectId: project.id,
        wagePerDayRupees: 800,
      });
      await markEmployeeAttendance(owner.api, {
        projectId: project.id,
        date: todayInIndia(),
        employeeIds: [employee.id],
      });

      const wagesPage = new WagesPage(page, project.id);
      await wagesPage.goto();
      await expect(wagesPage.amount(employee.name, "Final Amount")).toHaveText(
        "₹800.00",
      );
      await wagesPage.pay(employee.name, { amount: "800" });

      await expect(wagesPage.amount(employee.name, "Paid")).toHaveText(
        "₹800.00",
      );
      await expect(wagesPage.amount(employee.name, "Final Amount")).toHaveText(
        "₹0.00",
      );
      await wagesPage.tab("Payments").click();
      await expect(
        wagesPage.main.getByText(employee.name).first(),
      ).toBeVisible();
    },
  );
});
