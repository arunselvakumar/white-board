import { ProjectPage } from "./ProjectPage";

export class AmenitiesPage extends ProjectPage {
  public get url() {
    return `${this.base}/amenities`;
  }

  public option(name: string) {
    return this.page.getByRole("checkbox", { name, exact: true });
  }

  public get saveButton() {
    return this.button("Save");
  }
}
