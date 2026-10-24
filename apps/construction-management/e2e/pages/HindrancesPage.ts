import { ProjectPage } from "./ProjectPage";

/** Hindrances (CM-607): the register and Record hindrance. */
export class HindrancesPage extends ProjectPage {
  public get url() {
    return `${this.base}/hindrances`;
  }

  public get form() {
    return this.page.getByRole("form", { name: "New hindrance" });
  }
}
