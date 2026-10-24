import { ProjectPage } from "./ProjectPage";

/** Add Worksheet (Daily Worksheet, CM-602). */
export class WorksheetPage extends ProjectPage {
  public get url() {
    return `${this.base}/worksheets/new`;
  }

  public get form() {
    return this.page.getByRole("form", { name: "New Daily Worksheet" });
  }

  public async chooseFirst(label: string) {
    await this.form.getByRole("combobox", { name: label }).click();
    await this.page.getByRole("option").first().click();
  }

  public async chooseTask(name: string) {
    await this.form
      .getByRole("combobox", { name: "Task" })
      .fill(name.slice(0, 12));
    await this.page
      .getByRole("option", { name: new RegExp(name) })
      .first()
      .click();
  }

  public get saveButton() {
    return this.form.getByRole("button", { name: "Save", exact: true });
  }
}
