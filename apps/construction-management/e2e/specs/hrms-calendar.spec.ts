import { expect } from "@playwright/test";

import { addDays, todayInIndia } from "../api/dates";
import { EVERY_DAY, updateHrmsSettings } from "../api/hrms";
import { unique } from "../api/session";
import { companyTest } from "../helpers/companyTest";
import { HrmsPage } from "../pages/HrmsPage";

/** Chennai Central, where the test member "stands". */
const CHENNAI = { latitude: 13.0827, longitude: 80.2707 };

companyTest.describe("HRMS calendar and dashboard", () => {
  companyTest(
    "should show the holiday under Upcoming holidays, when the Owner adds one",
    async ({ page }) => {
      const name = unique("Company Foundation Day");
      const holidays = new HrmsPage(page, "/configuration/holidays");
      await holidays.goto();
      await holidays.button("Add Holiday").first().click();
      const dialog = page.getByRole("dialog", { name: "Add Holiday" });
      await dialog.getByLabel("Holiday name").fill(name);
      await dialog
        .getByLabel("Date", { exact: true })
        .fill(addDays(todayInIndia(), 5));
      await holidays.choose("Holiday type", "Company");
      await dialog
        .getByRole("button", { name: /^(Add|Save)/ })
        .last()
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(holidays.main.getByText(name)).toBeVisible();

      const dashboard = new HrmsPage(page);
      await dashboard.goto();
      await expect(dashboard.section("Upcoming holidays")).toContainText(name);
    },
  );

  companyTest(
    "should count the member as present on the HRMS Dashboard, when they have checked in",
    async ({ owner, newMember, page }) => {
      await updateHrmsSettings(owner.api, { workingDays: EVERY_DAY });
      const member = await newMember({
        roleName: "HRMS Staff",
        memberType: "hrms",
      });
      const memberPage = await member.page({
        geolocation: CHENNAI,
        permissions: ["geolocation"],
      });
      await memberPage.goto("/app/workspace/hrms/attendance/my");
      await memberPage
        .getByRole("button", { name: "Check In", exact: true })
        .click();
      await expect(
        memberPage.getByRole("button", { name: "Check Out", exact: true }),
      ).toBeVisible();

      const dashboard = new HrmsPage(page);
      await dashboard.goto();
      await expect(dashboard.main).toContainText(
        /Present today\s*1\s*of 2 Team Members/,
      );
    },
  );
});
