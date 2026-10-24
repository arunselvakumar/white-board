import { ProjectPage } from "./ProjectPage";

export class DocumentsPage extends ProjectPage {
  public get url() {
    return `${this.base}/documents`;
  }

  public get uploadButton() {
    return this.button("Upload").first();
  }

  public get uploadDialog() {
    return this.page.getByRole("dialog", { name: "Upload files" });
  }

  public get uploads() {
    return this.uploadDialog.getByRole("list", { name: "Uploads" });
  }

  public upload_(name: string) {
    return this.uploads.getByRole("listitem").filter({ hasText: name });
  }

  public get doneButton() {
    return this.uploadDialog.getByRole("button", { name: "Done" });
  }

  public async uploadFiles(
    files: Parameters<ProjectPage["upload"]>[1],
    paper?: string,
  ) {
    await this.uploadButton.click();
    if (paper != null) await this.choose("Paper", paper);
    await this.uploadDialog.getByLabel("Files to upload").setInputFiles(files);
  }

  public document(name: string) {
    return this.page.getByRole("link", { name: `View ${name}` });
  }
}
