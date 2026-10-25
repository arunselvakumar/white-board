import { ProjectPage } from "./ProjectPage";

export class ProjectDashboardPage extends ProjectPage {
  public get url() {
    return `${this.base}/dashboard`;
  }

  public section(name: string) {
    return this.page.getByRole("region", { name });
  }

  public get keyFigures() {
    return this.page.getByRole("list", { name: "Key figures" });
  }

  public get manageDashboardButton() {
    return this.button("Manage dashboard");
  }
}
