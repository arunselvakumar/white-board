import { AppShellPage } from "./AppShellPage";

/** Marketing (ADR CM-0040): its Dashboard, the area's own address. */
export class MarketingPage extends AppShellPage {
  public get url() {
    return "/app/marketing";
  }

  /** The Departments submenu in the sidebar, open on any Marketing page (ADR CM-0046). */
  public get departmentsSubmenu() {
    return this.mainMenu.getByRole("list", { name: "Departments" });
  }

  /** Marketing's page of cards, one per entry the Role opens (ADR CM-0046). */
  public get departmentUrl() {
    return "/app/departments/marketing";
  }

  /** The cards on Marketing's page, in order. */
  public get cards() {
    return this.page
      .getByRole("main")
      .getByRole("region", { name: "Marketing" })
      .getByRole("link");
  }

  /** A card on Marketing's page, by the entry's name. */
  public card(name: string) {
    return this.cards.filter({
      has: this.page.getByText(name, { exact: true }),
    });
  }

  /** A Dashboard total's card, by its label. */
  public total(name: string) {
    return this.page
      .getByRole("list", { name: "Totals" })
      .getByRole("listitem")
      .filter({ hasText: name });
  }
}
