import { ProjectPage } from "./ProjectPage";

/** A Project's Activity: people added to and removed from it (ADR CM-0038). */
export class ProjectActivityPage extends ProjectPage {
  public get url() {
    return `${this.base}/activity`;
  }

  /** The entries of one day, by its heading ("Today", "Yesterday", a date). */
  public day(name: string) {
    return this.page.getByRole("region", { name });
  }
}
