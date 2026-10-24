import { expect } from "@playwright/test";

import { unique } from "../api/session";
import { designationsPageTest } from "../helpers/designationsPageTest";
import { AddUserPage } from "../pages/AddUserPage";

designationsPageTest.describe("Designations", () => {
  designationsPageTest(
    "should offer the new Designation when adding a User, when the Owner adds one",
    async ({ designationsPage, page }) => {
      const name = unique("Safety Officer");

      await designationsPage.goto();
      await designationsPage.link("Add Designation").click();
      await designationsPage.field("Designation name").fill(name);
      await designationsPage.button("Save").click();
      await expect(page).toHaveURL(designationsPage.url);
      await expect(designationsPage.designation(name)).toBeVisible();

      const addUserPage = new AddUserPage(page);
      await addUserPage.goto();
      await addUserPage.choose("Designation", name);
      await expect(
        page.getByRole("combobox", { name: "Designation" }),
      ).toContainText(name);
    },
  );
});
