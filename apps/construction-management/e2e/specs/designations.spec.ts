import { expect } from "@playwright/test";

import { unique } from "../api/session";
import { designationsPageTest } from "../helpers/designationsPageTest";
import { AddStaffPage } from "../pages/AddStaffPage";

designationsPageTest.describe("Designations", () => {
  designationsPageTest(
    "should offer the new Designation when adding staff, when the Owner adds one",
    async ({ designationsPage, page }) => {
      const name = unique("Safety Officer");

      await designationsPage.goto();
      await designationsPage.link("Add Designation").click();
      await designationsPage.field("Designation name").fill(name);
      await designationsPage.button("Save").click();
      await expect(page).toHaveURL(designationsPage.url);
      await expect(designationsPage.designation(name)).toBeVisible();

      const addStaffPage = new AddStaffPage(page);
      await addStaffPage.goto();
      await addStaffPage.choose("Designation", name);
      await expect(
        page.getByRole("combobox", { name: "Designation" }),
      ).toContainText(name);
    },
  );
});
