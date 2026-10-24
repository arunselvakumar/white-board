import { AmenitiesPage } from "../pages/AmenitiesPage";
import { projectTest } from "./projectTest";

export const amenitiesPageTest = projectTest.extend<{
  amenitiesPage: AmenitiesPage;
}>({
  amenitiesPage: async ({ page, project }, use) => {
    await use(new AmenitiesPage(page, project.id));
  },
});
