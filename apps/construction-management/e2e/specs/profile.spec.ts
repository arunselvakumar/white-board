import { expect } from "@playwright/test";

import { FIXTURES } from "../fixtures";
import { profilePageTest } from "../helpers/profilePageTest";
import { StaffPage } from "../pages/StaffPage";
import { emailCodeFor } from "../api/mailpit";
import { ProfilePage } from "../pages/ProfilePage";

profilePageTest.describe("My Profile", () => {
  profilePageTest(
    "should keep the new name, contact and photo, when a User edits their profile",
    async ({ profilePage, page }) => {
      await profilePage.goto();
      await profilePage.nameField.fill("Kavya Raman");
      await profilePage.emergencyContactField.fill("Raman 98400 12345");
      await profilePage.saveChangesButton.click();
      await expect(profilePage.status(/saved/i)).toBeVisible();

      await profilePage.uploadPhoto(FIXTURES.logo);
      await expect(profilePage.photoRegion.getByRole("img")).toBeVisible();

      await page.reload();
      await expect(profilePage.nameField).toHaveValue("Kavya Raman");
      await expect(profilePage.emergencyContactField).toHaveValue(
        "Raman 98400 12345",
      );
      await expect(profilePage.photoRegion.getByRole("img")).toBeVisible();

      const staffPage = new StaffPage(page);
      await staffPage.goto();
      await expect(staffPage.user("Kavya Raman")).toBeVisible();
    },
  );

  profilePageTest(
    "should show the Aadhaar masked and reveal it only with the emailed code, when a User adds theirs",
    async ({ owner, page }) => {
      const profile = new ProfilePage(page);
      await profile.goto();
      await profile.button("Add Aadhaar").click();
      await profile.field("New Aadhaar").fill("4991 1866 5246");
      await profile.saveChangesButton.click();
      await expect(profile.status(/saved/i)).toBeVisible();
      await page.reload();
      await expect(profile.main).toContainText("5246");
      await expect(profile.main).not.toContainText("4991 1866 5246");

      await profile.button("Reveal").first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Send code" }).click();
      await dialog
        .getByRole("textbox", { name: "6-digit code" })
        .fill(await emailCodeFor(owner.email, "confirmation"));
      await dialog.getByRole("button", { name: "Verify and reveal" }).click();
      await expect(profile.main).toContainText(/4991\s?1866\s?5246/);
    },
  );
});
