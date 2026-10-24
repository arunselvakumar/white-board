import { GalleryPage } from "../pages/GalleryPage";
import { projectTest } from "./projectTest";

export const galleryPageTest = projectTest.extend<{ galleryPage: GalleryPage }>(
  {
    galleryPage: async ({ page, project }, use) => {
      await use(new GalleryPage(page, project.id));
    },
  },
);
