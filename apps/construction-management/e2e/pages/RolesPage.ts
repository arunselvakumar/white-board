import { AppShellPage } from "./AppShellPage";

export class RolesPage extends AppShellPage {
  public get url() {
    return "/app/roles";
  }

  public get pageHeading() {
    return this.heading("Role Management", { level: 1 });
  }

  public get addRoleLink() {
    return this.link("Add Role");
  }

  public get roles() {
    return this.page.getByRole("list", { name: "Roles" }).getByRole("listitem");
  }

  public role(name: string) {
    return this.roles.filter({
      has: this.page.getByRole("link", { name, exact: true }),
    });
  }
}
