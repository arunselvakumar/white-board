import { ProjectPage } from "./ProjectPage";

export class ResourcesPage extends ProjectPage {
  public get url() {
    return `${this.base}/resources`;
  }

  public section(
    name:
      | "Site Engineers"
      | "Labours"
      | "Team Members"
      | "Contractors"
      | "Suppliers"
      | "Vendors",
  ) {
    return this.page.getByRole("region", { name: new RegExp(`^${name} \\d+`) });
  }

  public editButton(
    name: "Team Members" | "Contractors" | "Suppliers" | "Vendors",
  ) {
    return this.button(`Edit ${name}`);
  }

  /** Ticks Labours in Add Labours and saves them from today. */
  public async addLabours(names: string[], remark?: string) {
    await this.button("Add Labours").click();
    for (const name of names)
      await this.dialog
        .getByRole("checkbox", { name: new RegExp(name) })
        .check();
    if (remark != null) await this.dialog.getByLabel(/Remark/).fill(remark);
    await this.dialog
      .getByRole("button", {
        name: `Add ${String(names.length)} Labour${names.length === 1 ? "" : "s"}`,
      })
      .click();
    await this.dialog.waitFor({ state: "hidden" });
  }
}
