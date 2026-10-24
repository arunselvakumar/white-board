import type { Page } from "@playwright/test";

import { ProjectPage } from "./ProjectPage";

/** Tasks (CM-802): Add Task and a Task's page. */
export class TaskPage extends ProjectPage {
  constructor(
    page: Page,
    projectId: string,
    private readonly taskId: string | null = null,
  ) {
    super(page, projectId);
  }

  public get url() {
    return this.taskId == null
      ? `${this.base}/tasks/new`
      : `${this.base}/tasks/${this.taskId}`;
  }

  public get form() {
    return this.page.getByRole("main").getByRole("form");
  }

  public get summary() {
    return this.page.getByRole("region", { name: "Summary" });
  }

  public async updateProgress(percent: string, remark?: string) {
    await this.button("Update Task Progress").click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByLabel("Progress (%)").fill(percent);
    if (remark != null) await dialog.getByLabel("Remark").fill(remark);
    await dialog.getByRole("button", { name: "Save" }).click();
    await dialog.waitFor({ state: "detached" });
  }
}
