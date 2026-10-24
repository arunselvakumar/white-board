import { expect } from "@playwright/test";

import { emailCodeFor } from "../api/mailpit";
import { companyTest } from "../helpers/companyTest";
import { UsersPage } from "../pages/UsersPage";
import { latestEmailTo } from "../api/mailpit";

companyTest.describe("Company ownership and deletion", () => {
  companyTest(
    "should schedule the Company for deletion and cancel it again, when the Owner confirms with the emailed code",
    async ({ owner, page }) => {
      await page.goto("/app/settings/company");
      await page.getByRole("button", { name: "Delete…" }).click();
      const dialog = page.getByRole("dialog", {
        name: `Delete ${owner.company.name}?`,
      });
      await dialog.getByLabel(/^Type .* to confirm$/).fill(owner.company.name);
      await dialog.getByRole("button", { name: "Send code" }).click();
      await dialog
        .getByRole("textbox", { name: "6-digit code" })
        .fill(await emailCodeFor(owner.email, "confirmation"));
      await dialog.getByRole("button", { name: "Delete Company" }).click();
      await expect(dialog).toHaveCount(0);

      const main = page.getByRole("main");
      await expect(main).toContainText(
        `Scheduled: ${owner.company.name} will be deleted on`,
      );
      await main.getByRole("button", { name: "Cancel deletion" }).click();
      await expect(main).not.toContainText("will be deleted on");
      await expect(main.getByRole("button", { name: "Delete…" })).toBeVisible();
    },
  );

  companyTest(
    "should make the member the Owner, when the Owner transfers ownership with the emailed code",
    async ({ owner, newMember, page }) => {
      const member = await newMember({ roleName: "Admin" });
      await page.goto("/app/settings/company");
      await page.getByRole("button", { name: "Transfer…" }).click();
      const dialog = page.getByRole("dialog", { name: "Transfer ownership" });
      await dialog.getByRole("combobox", { name: "New Owner" }).click();
      await page.getByRole("option", { name: new RegExp(member.name) }).click();
      await dialog.getByRole("button", { name: "Send code" }).click();
      await dialog
        .getByRole("textbox", { name: "6-digit code" })
        .fill(await emailCodeFor(owner.email, "confirmation"));
      await dialog.getByRole("button", { name: "Transfer ownership" }).click();
      await expect(dialog).toHaveCount(0);

      const users = new UsersPage(page);
      await users.goto();
      await expect(users.user(member.name)).toContainText("Owner");
      await expect(users.user(owner.name)).not.toContainText(
        /·\s*Owner|Owner ·/,
      );
    },
  );

  companyTest(
    "should email the Owner a link to the full backup, when they generate one with the emailed code",
    async ({ owner, page }) => {
      await page.goto("/app/settings/backup");
      const form = page.getByRole("form", { name: "Full Company backup" });
      await form.getByRole("button", { name: "Send code" }).click();
      await form
        .getByRole("textbox", { name: "6-digit code" })
        .fill(await emailCodeFor(owner.email, "confirmation"));
      await form.getByRole("button", { name: "Generate backup" }).click();

      const email = await latestEmailTo(
        owner.email,
        new RegExp(`full backup of ${owner.company.name} is ready`),
      );
      expect(email.Text).toMatch(/https?:\/\/\S+/);
    },
  );
});
