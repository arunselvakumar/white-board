import { ProjectPage } from "./ProjectPage";

export class GalleryPage extends ProjectPage {
  public get url() {
    return `${this.base}/gallery`;
  }

  public get files() {
    return this.page.getByRole("list", { name: "Files" });
  }

  public file(name: string) {
    return this.files.getByRole("button", { name });
  }
}
