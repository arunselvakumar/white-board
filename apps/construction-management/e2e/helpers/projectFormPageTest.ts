import { ProjectFormPage } from "../pages/ProjectFormPage";
import { companyTest } from "./companyTest";

export const projectFormPageTest = companyTest.extend<{
  projectFormPage: ProjectFormPage;
}>({
  projectFormPage: async ({ page }, use) => {
    await use(new ProjectFormPage(page));
  },
});
