import type { Page } from "@playwright/test";

import { AppShellPage } from "./AppShellPage";

export class EditUserPage extends AppShellPage {
  constructor(
    page: Page,
    private readonly memberId = "",
  ) {
    super(page);
  }

  public get url() {
    return `/app/users/${this.memberId}`;
  }

  public tab(name: "Details" | "Projects" | "Role") {
    return this.page.getByRole("tab", { name });
  }

  public get saveDetailsButton() {
    return this.button("Save details");
  }

  public get setPasswordButton() {
    return this.button("Set a new password");
  }

  public get summary() {
    return this.page.getByRole("main").getByRole("paragraph").first();
  }
}
