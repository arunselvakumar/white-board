import type { Page } from "@playwright/test";

import { AppShellPage } from "./AppShellPage";

/** A screen of Human Resources → HRMS (`/app/hrms/...`). */
export class HrmsPage extends AppShellPage {
  constructor(
    page: Page,
    private readonly path = "",
  ) {
    super(page);
  }

  public get url() {
    return `/app/hrms${this.path}`;
  }

  public section(name: string) {
    return this.page.getByRole("region", { name });
  }
}
