import { ProjectDashboardPage } from "../pages/ProjectDashboardPage";
import { projectTest } from "./projectTest";

export const projectDashboardPageTest = projectTest.extend<{
  projectDashboardPage: ProjectDashboardPage;
}>({
  projectDashboardPage: async ({ page, project }, use) => {
    await use(new ProjectDashboardPage(page, project.id));
  },
});
