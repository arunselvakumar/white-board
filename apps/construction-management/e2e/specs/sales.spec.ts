import { expect } from "@playwright/test";

import { newMobile, unique } from "../api/session";
import { projectTest } from "../helpers/projectTest";
import { AddWingPage } from "../pages/AddWingPage";
import { InquiryPage } from "../pages/InquiryPage";

projectTest.describe("Sales CRM", () => {
  projectTest(
    "should book the Unit, when a quick-added inquiry is followed up and closed as Converted",
    { tag: ["@pr"] },
    async ({ project, page }) => {
      await new AddWingPage(page, project.id).createResidential("A Wing", 2, 2);
      const customer = unique("Lakshmi Narayanan");

      const inquiries = new InquiryPage(page, project.id);
      await inquiries.goto();
      await inquiries.quickAdd({
        name: customer,
        mobile: newMobile().slice(3),
      });
      await inquiries.table.getByRole("link", { name: customer }).click();
      await expect(inquiries.heading(customer)).toBeVisible();

      await inquiries.addFollowUp(
        "Site visit done; liked the east-facing 2BHK.",
      );
      await expect(inquiries.main).toContainText("Site visit done");
      await inquiries.convert(customer, /A Wing/);
      await expect(inquiries.main).toContainText("Converted");

      await page.goto(`/app/projects/${project.id}/bookings/list`);
      await expect(
        page.getByRole("main").getByText(customer).first(),
      ).toBeVisible();
    },
  );

  projectTest(
    "should reopen a lost inquiry, when the Owner closes it as Lost and reopens it",
    async ({ project, page }) => {
      const customer = unique("Suresh Babu");
      const inquiries = new InquiryPage(page, project.id);
      await inquiries.goto();
      await inquiries.quickAdd({
        name: customer,
        mobile: newMobile().slice(3),
      });
      await inquiries.table.getByRole("link", { name: customer }).click();

      await inquiries.closeAsLost(customer);
      await expect(inquiries.main).toContainText("Lost");
      await inquiries.button("Reopen").click();
      const dialog = page.getByRole("alertdialog", {
        name: `Reopen ${customer}?`,
      });
      await expect(dialog).toContainText("goes back to Open");
      await dialog.getByRole("button", { name: "Reopen" }).click();
      await expect(inquiries.button("Close")).toBeVisible();
    },
  );

  projectTest(
    "should not offer a booked Unit again, when a second inquiry is converted",
    async ({ project, page }) => {
      await new AddWingPage(page, project.id).createResidential("A Wing", 0, 1);
      const inquiries = new InquiryPage(page, project.id);

      const first = unique("Deepak Raj");
      await inquiries.goto();
      await inquiries.quickAdd({ name: first, mobile: newMobile().slice(3) });
      await inquiries.table.getByRole("link", { name: first }).click();
      await inquiries.convert(first, /A Wing/);
      await expect(inquiries.main).toContainText("Converted");

      const second = unique("Meena Iyer");
      await inquiries.goto();
      await inquiries.quickAdd({ name: second, mobile: newMobile().slice(3) });
      await inquiries.table.getByRole("link", { name: second }).click();
      await inquiries.button("Close").click();
      const dialog = page.getByRole("dialog", { name: `Close ${second}` });
      await dialog.getByRole("radio", { name: "Converted" }).check();
      // The Wing's only Unit is booked by the first inquiry.
      await expect(dialog).toContainText(
        "No unit can be booked now: every unit is booked, on hold or unavailable.",
      );
    },
  );

  projectTest(
    "should show the Unit as booked on Units, when an inquiry books it",
    async ({ project, page }) => {
      await new AddWingPage(page, project.id).createResidential("B Wing", 0, 2);
      const customer = unique("Prakash M");
      const inquiries = new InquiryPage(page, project.id);
      await inquiries.goto();
      await inquiries.quickAdd({
        name: customer,
        mobile: newMobile().slice(3),
      });
      await inquiries.table.getByRole("link", { name: customer }).click();
      await inquiries.convert(customer, /B Wing/);

      await page.goto(`/app/projects/${project.id}/bookings/units`);
      await expect(page.getByRole("main")).toContainText(/Booked/);
      await expect(page.getByRole("main")).toContainText(/Available/);
    },
  );

  projectTest(
    "should list the new Funnel Stage, when the Owner adds one in Inquiry settings",
    async ({ project, page }) => {
      await page.goto(`/app/projects/${project.id}/inquiries/settings`);
      await page.getByRole("button", { name: "Add Funnel Stage" }).click();
      await page
        .getByRole("dialog")
        .getByRole("textbox")
        .first()
        .fill("Loan sanctioned");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /^(Add|Save)/ })
        .click();
      await expect(
        page.getByRole("list", { name: "Funnel Stages" }).getByRole("listitem"),
      ).toHaveCount(5);
      await expect(
        page.getByRole("list", { name: "Funnel Stages" }),
      ).toContainText("Loan sanctioned");
    },
  );
});
