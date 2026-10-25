import { AddLabourPage } from "../pages/AddLabourPage";
import { projectTest } from "./projectTest";

export const addLabourPageTest = projectTest.extend<{
  addLabourPage: AddLabourPage;
}>({
  addLabourPage: async ({ page }, use) => {
    await use(new AddLabourPage(page));
  },
});
