import { expect } from "@playwright/test";

import { createEmployee, todayInIndia } from "../api/labour";
import { unique } from "../api/session";
import { checkInPageTest } from "../helpers/checkInPageTest";
import { CheckInLogPage } from "../pages/CheckInLogPage";
import { EmployeeAttendancePage } from "../pages/EmployeeAttendancePage";
import { ProjectActivityPage } from "../pages/ProjectActivityPage";
import { ResourcesPage } from "../pages/ResourcesPage";
import { WagesPage } from "../pages/WagesPage";

checkInPageTest.describe("Check-In", () => {
  checkInPageTest(
    "should mark the Employee Present and owe the day's wage, when they are checked in with a photo",
    { tag: ["@pr", "@mobile"] },
    async ({ owner, project, checkInPage, page }) => {
      const employee = await createEmployee(owner.api, {
        projectId: project.id,
        wagePerDayRupees: 850,
      });
      await checkInPage.goto();
      await checkInPage.searchBox.fill(employee.name);
      await expect(
        checkInPage.group("Employees").getByRole("link"),
      ).toHaveCount(1);

      await checkInPage.record(employee.name, "Check In");
      await expect(page.getByText(/^Checked in at /)).toBeVisible();
      await checkInPage.doneButton.click();
      await expect(checkInPage.person(employee.name)).toContainText("In ·");

      // In again, the screen offers the other action.
      await checkInPage.person(employee.name).click();
      await expect(page.getByText(/^In since /)).toBeVisible();
      await expect(checkInPage.entrySelect).toContainText("Check Out");

      const attendancePage = new EmployeeAttendancePage(page, project.id);
      await attendancePage.goto();
      await expect(
        attendancePage.statusButton(employee.name, "Present"),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        attendancePage.form.getByLabel(
          `${employee.name} times are from Check-In`,
        ),
      ).toBeVisible();

      const wagesPage = new WagesPage(page, project.id);
      await wagesPage.goto();
      await expect(wagesPage.amount(employee.name, "To Pay")).toHaveText(
        "₹850.00",
      );
    },
  );

  checkInPageTest(
    "should clear the day and owe nothing, when the Employee's only check-in entry is voided",
    async ({ owner, project, checkInPage, page }) => {
      const employee = await createEmployee(owner.api, {
        projectId: project.id,
        wagePerDayRupees: 700,
      });
      await checkInPage.goto();
      await checkInPage.record(employee.name, "Check In");
      await expect(page.getByText(/^Checked in at /)).toBeVisible();

      const logPage = new CheckInLogPage(page, project.id);
      await logPage.goto();
      const entry = logPage.entry(new RegExp(`^${employee.name}, Check In`));
      await entry.getByRole("button", { name: /^Void/ }).click();
      await logPage.dialog.getByLabel("Reason").fill("Wrong person");
      await logPage.clickAndWaitFor(
        logPage.dialog.getByRole("button", { name: "Void entry" }),
        "/void",
      );
      await expect(entry).toContainText("Wrong person");

      const attendancePage = new EmployeeAttendancePage(page, project.id);
      await attendancePage.goto();
      await expect(
        attendancePage.statusButton(employee.name, "Present"),
      ).toHaveAttribute("aria-pressed", "false");

      const wagesPage = new WagesPage(page, project.id);
      await wagesPage.goto();
      await expect(wagesPage.amount(employee.name, "To Pay")).toHaveText(
        "₹0.00",
      );
    },
  );

  checkInPageTest(
    "should show the Check In with its photo and place on the Employee's and the Project's Activity, when an Employee is checked in",
    async ({ owner, project, checkInPage, page }) => {
      const employee = await createEmployee(owner.api, {
        projectId: project.id,
      });
      await checkInPage.goto();
      await checkInPage.record(employee.name, "Check In");
      await expect(page.getByText(/^Checked in at /)).toBeVisible();

      const activityPage = new ProjectActivityPage(page, project.id);
      await activityPage.goto();
      const entry = activityPage
        .day("Today")
        .getByRole("listitem")
        .filter({ hasText: `${employee.name} checked in` });
      await expect(entry).toBeVisible();
      await expect(
        entry.getByRole("link", { name: "Open in Maps" }),
      ).toHaveAttribute(
        "href",
        "https://www.google.com/maps?q=11.0168,76.9558",
      );
      await entry.getByRole("button", { name: /photo/i }).click();
      // The dialog's title names the photo, so the image itself has no
      // role; what matters is that the private photo really loads.
      const photo = activityPage.dialog.locator("img");
      await expect(photo).toBeVisible();
      await expect
        .poll(() =>
          photo.evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
      await page.keyboard.press("Escape");

      await page.goto(`/app/staff/employees/${employee.id}?tab=activity`);
      await expect(
        page
          .getByRole("region", { name: "Today" })
          .getByText(/^Checked in at /),
      ).toBeVisible();
    },
  );

  checkInPageTest(
    "should open the Employee's page, when the Owner clicks anywhere on their row on Teams",
    async ({ owner, project, page }) => {
      const employee = await createEmployee(owner.api, {
        projectId: project.id,
      });
      const teamsPage = new ResourcesPage(page, project.id);
      await teamsPage.goto();
      const row = page.getByRole("listitem").filter({ hasText: employee.name });
      const box = await row.boundingBox();
      // The far end of the row, well clear of the name and of its Actions.
      await row.click({
        position: { x: (box?.width ?? 0) - 16, y: (box?.height ?? 0) / 2 },
      });
      await expect(page).toHaveURL(
        new RegExp(`/app/staff/employees/${employee.id}$`),
      );
    },
  );

  checkInPageTest(
    "should show the Check In and the Project on a Vendor's and a Site Engineer Employee's Activity tab, when they are checked in",
    async ({ owner, project, checkInPage, page }) => {
      type Created = { item?: { id: string }; id?: string };
      const vendorName = unique("Selvam Gang");
      const vendor = await owner.api.post<Created>(
        "/api/construction/labour/vendors",
        {
          name: vendorName,
          joiningDate: todayInIndia(-30),
          projectIds: [project.id],
        },
      );
      // Any Employee checks in, whatever their Role (ADR CM-0055 §3).
      const engineer = await createEmployee(owner.api, {
        projectId: project.id,
        name: unique("Sundar Rajan"),
        role: "Site Engineer",
      });
      await checkInPage.goto();
      for (const name of [vendorName, engineer.name]) {
        await checkInPage.record(name, "Check In");
        await expect(page.getByText(/^Checked in at /)).toBeVisible();
        await checkInPage.doneButton.click();
      }

      for (const path of [
        `/app/staff/vendors/${vendor.item?.id ?? vendor.id ?? ""}`,
        `/app/staff/employees/${engineer.id}`,
      ]) {
        await page.goto(`${path}?tab=activity`);
        const today = page.getByRole("region", { name: "Today" });
        await expect(today.getByText(/^Checked in at /)).toBeVisible();
        await expect(today.getByText(/^Added to /)).toBeVisible();
        await expect(
          today.getByRole("link", { name: "Open in Maps" }),
        ).toBeVisible();
      }
    },
  );
});
