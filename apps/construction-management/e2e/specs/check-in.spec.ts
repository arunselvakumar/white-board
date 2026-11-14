import { expect } from "@playwright/test";

import { createLabour } from "../api/labour";
import { checkInPageTest } from "../helpers/checkInPageTest";
import { CheckInLogPage } from "../pages/CheckInLogPage";
import { LabourAttendancePage } from "../pages/LabourAttendancePage";
import { WagesPage } from "../pages/WagesPage";

checkInPageTest.describe("Check-In", () => {
  checkInPageTest(
    "should mark the Labour Present and owe the day's wage, when they are checked in with a photo",
    { tag: ["@pr", "@mobile"] },
    async ({ owner, project, checkInPage, page }) => {
      const labour = await createLabour(owner.api, {
        projectId: project.id,
        wagePerDayRupees: 850,
      });
      await checkInPage.goto();
      await checkInPage.searchBox.fill(labour.name);
      await expect(checkInPage.group("Labours").getByRole("link")).toHaveCount(
        1,
      );

      await checkInPage.record(labour.name, "Check In");
      await expect(page.getByText(/^Checked in at /)).toBeVisible();
      await checkInPage.doneButton.click();
      await expect(checkInPage.person(labour.name)).toContainText("In ·");

      // In again, the screen offers the other action.
      await checkInPage.person(labour.name).click();
      await expect(page.getByText(/^In since /)).toBeVisible();
      await expect(checkInPage.entrySelect).toContainText("Check Out");

      const attendancePage = new LabourAttendancePage(page, project.id);
      await attendancePage.goto();
      await expect(
        attendancePage.statusButton(labour.name, "Present"),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        attendancePage.form.getByLabel(
          `${labour.name} times are from Check-In`,
        ),
      ).toBeVisible();

      const wagesPage = new WagesPage(page, project.id);
      await wagesPage.goto();
      await expect(wagesPage.amount(labour.name, "To Pay")).toHaveText(
        "₹850.00",
      );
    },
  );

  checkInPageTest(
    "should clear the day and owe nothing, when the Labour's only check-in entry is voided",
    async ({ owner, project, checkInPage, page }) => {
      const labour = await createLabour(owner.api, {
        projectId: project.id,
        wagePerDayRupees: 700,
      });
      await checkInPage.goto();
      await checkInPage.record(labour.name, "Check In");
      await expect(page.getByText(/^Checked in at /)).toBeVisible();

      const logPage = new CheckInLogPage(page, project.id);
      await logPage.goto();
      const entry = logPage.entry(new RegExp(`^${labour.name}, Check In`));
      await entry.getByRole("button", { name: /^Void/ }).click();
      await logPage.dialog.getByLabel("Reason").fill("Wrong person");
      await logPage.clickAndWaitFor(
        logPage.dialog.getByRole("button", { name: "Void entry" }),
        "/void",
      );
      await expect(entry).toContainText("Wrong person");

      const attendancePage = new LabourAttendancePage(page, project.id);
      await attendancePage.goto();
      await expect(
        attendancePage.statusButton(labour.name, "Present"),
      ).toHaveAttribute("aria-pressed", "false");

      const wagesPage = new WagesPage(page, project.id);
      await wagesPage.goto();
      await expect(wagesPage.amount(labour.name, "To Pay")).toHaveText("₹0.00");
    },
  );
});
