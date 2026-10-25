import { AppShellPage } from "./AppShellPage";

export class LaboursPage extends AppShellPage {
  public get url() {
    return "/app/masters/labours";
  }

  public get table() {
    return this.page.getByRole("table", { name: "Labours" });
  }

  public row(name: string) {
    return this.table.getByRole("row").filter({ hasText: name });
  }

  public get addLabourLink() {
    return this.link("Add Labour");
  }

  public get importButton() {
    return this.button("Import");
  }
}
