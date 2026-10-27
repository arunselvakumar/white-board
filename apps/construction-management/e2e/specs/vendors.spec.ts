import { expect } from "@playwright/test";

import { unique } from "../api/session";
import { projectTest } from "../helpers/projectTest";
import { AddVendorPage } from "../pages/AddVendorPage";
import { VendorAttendancePage } from "../pages/VendorAttendancePage";
import { WagesPage } from "../pages/WagesPage";

projectTest.describe("Vendors", () => {
  projectTest(
    "should owe the Vendor heads × rate, when the Owner adds a Vendor with a rate card and records a day",
    async ({ project, page }) => {
      const vendor = unique("Lakshmi Labour Contractors");
      const addVendorPage = new AddVendorPage(page);
      await addVendorPage.goto();
      await addVendorPage.fill({
        name: vendor,
        project: project.name,
        category: "Mason",
        ratePerDay: "900",
      });
      await addVendorPage.saveButton.click();
      await expect(page).toHaveURL(/\/app\/vendors$/);

      const attendancePage = new VendorAttendancePage(page, project.id);
      await attendancePage.goto();
      await attendancePage.fullDay(vendor, "Shift 1", "Mason").fill("3");
      await expect(attendancePage.dayTotal(vendor)).toContainText("₹2,700.00");
      await attendancePage.save(vendor);

      const wagesPage = new WagesPage(page, project.id);
      await wagesPage.goto();
      await wagesPage.tab("Vendor").click();
      await expect(wagesPage.balanceRow(vendor)).toContainText("₹2,700.00");
    },
  );
});
