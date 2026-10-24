import { expect } from "@playwright/test";

import {
  createLabour,
  markLabourAttendance,
  todayInIndia,
} from "../api/labour";
import { unique } from "../api/session";
import { labourAttendancePageTest } from "../helpers/labourAttendancePageTest";
import { AddLabourPage } from "../pages/AddLabourPage";
import { LabourAttendancePage } from "../pages/LabourAttendancePage";
import { LaboursPage } from "../pages/LaboursPage";
import { WagesPage } from "../pages/WagesPage";

labourAttendancePageTest.describe("Labour", () => {
  labourAttendancePageTest(
    "should owe the day's wage, when the Owner adds a Labour and marks them Present",
    { tag: ["@pr", "@mobile"] },
    async ({ project, page }) => {
      const name = unique("Ravi Kumar");
      const addLabourPage = new AddLabourPage(page);
      await addLabourPage.goto();
      await addLabourPage.fill({
        name,
        wagePerDay: "850",
        project: project.name,
        joiningDate: todayInIndia(-10),
      });
      await addLabourPage.saveButton.click();
      const laboursPage = new LaboursPage(page);
      await expect(page).toHaveURL(laboursPage.url);
      await expect(laboursPage.row(name)).toContainText("₹850.00 / day");

      const attendancePage = new LabourAttendancePage(page, project.id);
      await attendancePage.goto();
      await attendancePage.statusButton(name, "Present").click();
      await attendancePage.saveButton.click();
      await expect(attendancePage.summary).toContainText("1 saved");
      await expect(attendancePage.summary).toContainText("₹850.00");

      const wagesPage = new WagesPage(page, project.id);
      await wagesPage.goto();
      await expect(wagesPage.amount(name, "To Pay")).toHaveText("₹850.00");
      await expect(wagesPage.amount(name, "Final Amount")).toHaveText(
        "₹850.00",
      );
    },
  );

  labourAttendancePageTest(
    "should owe half the wage, when a Labour is marked Half Day",
    async ({ owner, project, labourAttendancePage, page }) => {
      const labour = await createLabour(owner.api, {
        projectId: project.id,
        wagePerDayRupees: 900,
      });
      await labourAttendancePage.goto();
      await labourAttendancePage.statusButton(labour.name, "Half Day").click();
      await labourAttendancePage.saveButton.click();
      await expect(labourAttendancePage.summary).toContainText("₹450.00");

      const wagesPage = new WagesPage(page, project.id);
      await wagesPage.goto();
      await expect(wagesPage.amount(labour.name, "To Pay")).toHaveText(
        "₹450.00",
      );
    },
  );

  labourAttendancePageTest(
    "should clear the balance, when the Owner pays a Labour what they are owed",
    { tag: ["@pr"] },
    async ({ owner, project, page }) => {
      const labour = await createLabour(owner.api, {
        projectId: project.id,
        wagePerDayRupees: 800,
      });
      await markLabourAttendance(owner.api, {
        projectId: project.id,
        date: todayInIndia(),
        labourIds: [labour.id],
      });

      const wagesPage = new WagesPage(page, project.id);
      await wagesPage.goto();
      await expect(wagesPage.amount(labour.name, "Final Amount")).toHaveText(
        "₹800.00",
      );
      await wagesPage.pay(labour.name, { amount: "800" });

      await expect(wagesPage.amount(labour.name, "Paid")).toHaveText("₹800.00");
      await expect(wagesPage.amount(labour.name, "Final Amount")).toHaveText(
        "₹0.00",
      );
      await wagesPage.tab("Payments").click();
      await expect(wagesPage.main.getByText(labour.name).first()).toBeVisible();
    },
  );
});
