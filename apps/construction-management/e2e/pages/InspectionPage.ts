import { ProjectPage } from "./ProjectPage";

/** Inspection Requests (CM-804): New Inspection Request and its Decision. */
export class InspectionPage extends ProjectPage {
  public get url() {
    return `${this.base}/inspections/new`;
  }

  public get form() {
    return this.page.getByRole("form", { name: "New Inspection Request" });
  }

  public get decision() {
    return this.page.getByRole("region", { name: "Decision" });
  }
}
