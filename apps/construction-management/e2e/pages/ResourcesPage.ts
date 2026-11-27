import { ProjectPage } from "./ProjectPage";

export class ResourcesPage extends ProjectPage {
  public get url() {
    return `${this.base}/teams`;
  }

  public section(
    name:
      "Employees" | "Team Members" | "Contractors" | "Suppliers" | "Vendors",
  ) {
    return this.page.getByRole("region", { name: new RegExp(`^${name} \\d+`) });
  }

  public editButton(
    name: "Team Members" | "Contractors" | "Suppliers" | "Vendors",
  ) {
    return this.button(`Edit ${name}`);
  }

  /** Ticks one in a section's Edit dialog (Team Members, Vendors…) and saves. */
  public async assign(
    section: "Team Members" | "Contractors" | "Suppliers" | "Vendors",
    name: string,
  ) {
    await this.editButton(section).click();
    await this.dialog.getByRole("checkbox", { name: new RegExp(name) }).check();
    await this.dialog.getByRole("button", { name: /Save/ }).click();
    await this.dialog.waitFor({ state: "hidden" });
  }

  /** Ticks Employees in Add Employees and saves them from today. */
  public async addEmployees(names: string[], remark?: string) {
    await this.button("Add Employees").click();
    for (const name of names)
      await this.dialog
        .getByRole("checkbox", { name: new RegExp(name) })
        .check();
    if (remark != null) await this.dialog.getByLabel(/Remark/).fill(remark);
    await this.dialog
      .getByRole("button", {
        name:
          names.length > 1 ? `Add ${String(names.length)} Employees` : "Add",
        exact: true,
      })
      .click();
    await this.dialog.waitFor({ state: "hidden" });
  }
}
