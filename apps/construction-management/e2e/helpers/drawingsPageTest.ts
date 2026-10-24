import { DrawingsPage } from "../pages/DrawingsPage";
import { projectTest } from "./projectTest";

export const drawingsPageTest = projectTest.extend<{
  drawingsPage: DrawingsPage;
}>({
  drawingsPage: async ({ page, project }, use) => {
    await use(new DrawingsPage(page, project.id));
  },
});
