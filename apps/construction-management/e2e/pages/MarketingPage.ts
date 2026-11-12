import { AppShellPage } from "./AppShellPage";

/** Marketing (ADR CM-0040): its Dashboard, the area's own address. */
export class MarketingPage extends AppShellPage {
  public get url() {
    return "/app/marketing";
  }

  /** The Marketing submenu in the sidebar, once it is open. */
  public get submenu() {
    return this.mainMenu.getByRole("list", { name: "Marketing" });
  }

  /** The submenu's entries, in order. */
  public get submenuLinks() {
    return this.submenu.getByRole("link");
  }
}
