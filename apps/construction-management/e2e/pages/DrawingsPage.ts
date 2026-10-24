import { ProjectPage } from "./ProjectPage";

export class DrawingsPage extends ProjectPage {
  public get url() {
    return `${this.base}/drawings`;
  }

  public album(name: string) {
    return this.page
      .getByRole("list", { name: "Albums" })
      .getByRole("link", { name: new RegExp(`^${name}`) });
  }

  public get uploadButton() {
    return this.button(/^Upload/).first();
  }

  public get uploadDialog() {
    return this.page.getByRole("dialog", { name: "Upload drawings" });
  }

  public async uploadDrawing(file: string, name?: string) {
    await this.uploadButton.click();
    await this.uploadDialog.getByLabel("Drawing files").setInputFiles(file);
    if (name != null)
      await this.uploadDialog.getByLabel("Drawing name").fill(name);
    await this.uploadDialog
      .getByRole("button", { name: /^Upload 1 file/ })
      .click();
    await this.uploadDialog
      .getByRole("list", { name: "Uploads" })
      .getByText("Done")
      .waitFor();
    await this.uploadDialog.getByRole("button", { name: "Done" }).click();
  }
}
