import { ResourcesPage } from "../pages/ResourcesPage";
import { projectTest } from "./projectTest";

export const resourcesPageTest = projectTest.extend<{
  resourcesPage: ResourcesPage;
}>({
  resourcesPage: async ({ page, project }, use) => {
    await use(new ResourcesPage(page, project.id));
  },
});
