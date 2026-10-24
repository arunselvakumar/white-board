import { ProjectPage } from "./ProjectPage";

export class TestingReportsPage extends ProjectPage {
  public get url() {
    return `${this.base}/testing-reports`;
  }

  public material(name: string) {
    return this.page
      .getByRole("list", { name: "Testing materials" })
      .getByRole("link", { name: new RegExp(`^${name}`) });
  }
}
