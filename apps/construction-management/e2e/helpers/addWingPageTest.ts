import { AddWingPage } from "../pages/AddWingPage";
import { projectTest } from "./projectTest";

export const addWingPageTest = projectTest.extend<{ addWingPage: AddWingPage }>(
  {
    addWingPage: async ({ page, project }, use) => {
      await use(new AddWingPage(page, project.id));
    },
  },
);
