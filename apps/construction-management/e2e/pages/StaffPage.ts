import { AppShellPage } from "./AppShellPage";

export class StaffPage extends AppShellPage {
  public get url() {
    return "/app/staff";
  }

  public get pageHeading() {
    return this.heading("Staff", { level: 1 });
  }

  public get addUserLink() {
    return this.link("Add Staff");
  }

  public get searchBox() {
    return this.page.getByRole("searchbox", { name: "Search Staff" });
  }

  public statusFilter(name: string) {
    return this.page
      .getByRole("tablist", { name: "Status" })
      .getByRole("tab", { name });
  }

  public get users() {
    return this.page.getByRole("list", { name: "Staff" }).getByRole("listitem");
  }

  public user(name: string) {
    return this.users.filter({ hasText: name });
  }
}
