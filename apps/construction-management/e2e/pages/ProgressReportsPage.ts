import { ProjectPage } from "./ProjectPage";

export class ProgressReportsPage extends ProjectPage {
  public get url() {
    return `${this.base}/progress-reports`;
  }

  public get reports() {
    return this.page.getByRole("list", { name: "Progress Reports" });
  }

  public async createDailyReport(input: {
    filledBy: string;
    withImages?: boolean;
  }) {
    await this.button("Create new").first().click();
    const dialog = this.page.getByRole("dialog");
    await this.choose("Report filled by", input.filledBy);
    if (input.withImages === true)
      await dialog
        .getByRole("checkbox", { name: /Include images in report/ })
        .check();
    await dialog.getByRole("button", { name: "Generate" }).click();
    await dialog.waitFor({ state: "detached" });
  }

  public get downloadLink() {
    return this.reports.getByRole("link", { name: /^Download DPR\// }).first();
  }
}
