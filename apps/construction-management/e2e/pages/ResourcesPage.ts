import { ProjectPage } from "./ProjectPage";

export class ResourcesPage extends ProjectPage {
  public get url() {
    return `${this.base}/resources`;
  }

  public section(
    name: "Team Members" | "Contractors" | "Suppliers" | "Vendors",
  ) {
    return this.page.getByRole("region", { name: new RegExp(`^${name} \\d+`) });
  }

  public editButton(
    name: "Team Members" | "Contractors" | "Suppliers" | "Vendors",
  ) {
    return this.button(`Edit ${name}`);
  }
}
