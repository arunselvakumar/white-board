import type { Page } from "@playwright/test";

import { AppShellPage } from "./AppShellPage";

/** Add Role and Edit Role: name, description and the Permission Matrix. */
export class RoleFormPage extends AppShellPage {
  constructor(
    page: Page,
    private readonly roleId: string | null = null,
  ) {
    super(page);
  }

  public get url() {
    return this.roleId == null ? "/app/roles/new" : `/app/roles/${this.roleId}`;
  }

  public get roleNameField() {
    return this.page.getByRole("textbox", { name: "Role name" });
  }

  public get descriptionField() {
    return this.page.getByRole("textbox", { name: "Description" });
  }

  public get matrix() {
    return this.page.getByRole("region", { name: "Permission Matrix" });
  }

  /** One cell of the matrix, e.g. permission("View", "Project"). */
  public permission(flag: string, menu: string) {
    return this.matrix.getByRole("checkbox", {
      name: `${flag} — ${menu}`,
      exact: true,
    });
  }

  public get grantedCount() {
    return this.matrix.getByText(/permissions? granted/);
  }

  public get saveButton() {
    return this.page.getByRole("button", { name: /^(Save|Add Role)$/ });
  }
}
