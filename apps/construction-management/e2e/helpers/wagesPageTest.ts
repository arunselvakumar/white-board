import { WagesPage } from "../pages/WagesPage";
import { projectTest } from "./projectTest";

export const wagesPageTest = projectTest.extend<{ wagesPage: WagesPage }>({
  wagesPage: async ({ page, project }, use) => {
    await use(new WagesPage(page, project.id));
  },
});
