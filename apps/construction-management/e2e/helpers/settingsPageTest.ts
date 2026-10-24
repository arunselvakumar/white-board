import { SettingsPage } from "../pages/SettingsPage";
import { companyTest } from "./companyTest";

export const settingsPageTest = companyTest.extend<{
  settingsPage: SettingsPage;
}>({
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
  },
});
