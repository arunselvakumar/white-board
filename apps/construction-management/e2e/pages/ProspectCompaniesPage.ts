import { AppShellPage } from "./AppShellPage";

/** Marketing → Companies (ADR CM-0040): the list, the form and a company's page. */
export class ProspectCompaniesPage extends AppShellPage {
  public get url() {
    return "/app/marketing/companies";
  }

  /** The list's rows or, on a phone, its cards. */
  public get list() {
    return this.main
      .getByRole("table", { name: "Prospect Companies" })
      .or(this.main.getByRole("list", { name: "Prospect Companies" }));
  }

  public get search() {
    return this.field("Search");
  }

  public get contacts() {
    return this.main.getByRole("list", { name: "Contacts" });
  }

  public get history() {
    return this.main.getByRole("list", { name: "History" });
  }

  /** Opens the company page's Actions menu and picks `item`. */
  public async action(item: string) {
    await this.button("Actions").click();
    await this.menuItem(item).click();
  }
}
