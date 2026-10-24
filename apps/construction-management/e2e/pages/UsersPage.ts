import { AppShellPage } from "./AppShellPage";

export class UsersPage extends AppShellPage {
  public get url() {
    return "/app/users";
  }

  public get pageHeading() {
    return this.heading("Users", { level: 1 });
  }

  public get addUserLink() {
    return this.link("Add User");
  }

  public get searchBox() {
    return this.page.getByRole("searchbox", { name: "Search Users" });
  }

  public statusFilter(name: string) {
    return this.page
      .getByRole("group", { name: "Status" })
      .getByRole("button", { name });
  }

  public get users() {
    return this.page.getByRole("list", { name: "Users" }).getByRole("listitem");
  }

  public user(name: string) {
    return this.users.filter({ hasText: name });
  }
}
