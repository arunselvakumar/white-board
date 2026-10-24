import { ProjectsPage } from "../pages/ProjectsPage";
import { companyTest } from "./companyTest";

export const projectsPageTest = companyTest.extend<{
  projectsPage: ProjectsPage;
}>({
  projectsPage: async ({ page }, use) => {
    await use(new ProjectsPage(page));
  },
});
