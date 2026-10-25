import type { Page } from "@playwright/test";

import { AppShellPage } from "./AppShellPage";

/** A screen of Workspace → HRMS (`/app/workspace/hrms/...`). */
export class HrmsPage extends AppShellPage {
  constructor(
    page: Page,
    private readonly path = "",
  ) {
    super(page);
  }

  public get url() {
    return `/app/workspace/hrms${this.path}`;
  }

  public section(name: string) {
    return this.page.getByRole("region", { name });
  }
}
