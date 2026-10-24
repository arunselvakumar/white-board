import { ProjectPage } from "./ProjectPage";

export class WingsPage extends ProjectPage {
  public get url() {
    return `${this.base}/wings`;
  }

  public get addWingLink() {
    return this.link("Add Wing");
  }

  public get addPhaseButton() {
    return this.button("Add Phase");
  }

  public wing(name: string) {
    return this.page.getByRole("link", { name: new RegExp(name) });
  }
}
