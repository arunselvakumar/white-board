import { LaboursPage } from "../pages/LaboursPage";
import { projectTest } from "./projectTest";

export const laboursPageTest = projectTest.extend<{ laboursPage: LaboursPage }>(
  {
    laboursPage: async ({ page }, use) => {
      await use(new LaboursPage(page));
    },
  },
);
