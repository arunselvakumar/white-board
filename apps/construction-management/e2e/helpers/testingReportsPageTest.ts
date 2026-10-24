import { TestingReportsPage } from "../pages/TestingReportsPage";
import { projectTest } from "./projectTest";

export const testingReportsPageTest = projectTest.extend<{
  testingReportsPage: TestingReportsPage;
}>({
  testingReportsPage: async ({ page, project }, use) => {
    await use(new TestingReportsPage(page, project.id));
  },
});
