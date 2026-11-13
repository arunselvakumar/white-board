import { AppShellPage } from "./AppShellPage";

/** Marketing → Visits (ADR CM-0040 §7): the list, the form and a Visit's page. */
export class VisitsPage extends AppShellPage {
  public get url() {
    return "/app/marketing/visits";
  }

  /** The list's rows or, on a phone, its cards. */
  public get list() {
    return this.main
      .getByRole("table", { name: "Visits" })
      .or(this.main.getByRole("list", { name: "Visits" }));
  }

  public get notes() {
    return this.main.getByRole("list", { name: "Notes" });
  }

  public get history() {
    return this.main.getByRole("list", { name: "History" });
  }

  /** Plans a Visit to a company already picked by the address. */
  public async gotoPlan(prospectCompanyId: string) {
    await this.page.goto(
      `${this.url}/new?status=planned&prospectCompanyId=${prospectCompanyId}`,
    );
  }

  /** Opens the Visit page's Actions menu and picks `item`. */
  public async action(item: string) {
    await this.page
      .getByRole("button", { name: "Actions", exact: true })
      .click();
    await this.menuItem(item).click();
  }
}
