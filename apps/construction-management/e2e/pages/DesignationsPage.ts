import { AppShellPage } from "./AppShellPage";

export class DesignationsPage extends AppShellPage {
  public get url() {
    return "/app/masters/designations";
  }

  public designation(name: string) {
    return this.page.getByRole("listitem").filter({
      has: this.page.getByRole("link", { name, exact: true }),
    });
  }
}
