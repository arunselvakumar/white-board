import { WingsPage } from "../pages/WingsPage";
import { projectTest } from "./projectTest";

export const wingsPageTest = projectTest.extend<{ wingsPage: WingsPage }>({
  wingsPage: async ({ page, project }, use) => {
    await use(new WingsPage(page, project.id));
  },
});
