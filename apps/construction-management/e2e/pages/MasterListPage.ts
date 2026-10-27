import type { Page } from "@playwright/test";

import { AppShellPage } from "./AppShellPage";

/**
 * A list page (`/app/masters/<list>`, or a Labour & Vendors list such as
 * `/app/supervisors`): Add, search and its rows.
 */
export class MasterListPage extends AppShellPage {
  constructor(
    page: Page,
    private readonly path: string,
    private readonly title: string,
  ) {
    super(page);
  }

  public get url() {
    return this.path;
  }

  public get pageHeading() {
    return this.heading(this.title, { level: 1 });
  }

  public get items() {
    return this.page
      .getByRole("list", { name: this.title })
      .or(this.page.getByRole("table", { name: this.title }));
  }

  public item(name: string) {
    return this.items.getByText(name, { exact: true });
  }
}
