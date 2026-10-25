import { DocumentsPage } from "../pages/DocumentsPage";
import { projectTest } from "./projectTest";

export const documentsPageTest = projectTest.extend<{
  documentsPage: DocumentsPage;
}>({
  documentsPage: async ({ page, project }, use) => {
    await use(new DocumentsPage(page, project.id));
  },
});
