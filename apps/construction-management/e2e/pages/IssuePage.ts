import type { Page } from "@playwright/test";

import { ProjectPage } from "./ProjectPage";

/** Issues & Snags (CM-803): New issue and an issue's page. */
export class IssuePage extends ProjectPage {
  constructor(
    page: Page,
    projectId: string,
    private readonly path = "/issues/new",
  ) {
    super(page, projectId);
  }

  public get url() {
    return `${this.base}${this.path}`;
  }

  public get form() {
    return this.page.getByRole("form", { name: "New issue" });
  }

  public get number() {
    return this.heading(/^ISS\//);
  }

  public get composer() {
    return this.page.getByRole("form", { name: "Add Update" });
  }

  public async postUpdate(text: string, image?: string) {
    await this.composer.getByLabel("Add Update").fill(text);
    if (image != null)
      await this.composer
        .getByLabel(/^Choose .* for Images$/)
        .setInputFiles(image);
    await this.composer.getByRole("button", { name: "Post update" }).click();
  }

  public get updates() {
    return this.page.getByRole("list", { name: "Updates" });
  }
}
