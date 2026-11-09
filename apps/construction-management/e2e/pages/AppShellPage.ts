import { BasePage } from "./BasePage";

/**
 * The signed-in shell around every /app screen: the sidebar (account row,
 * main menu, Switch Company) and, on a phone, its slim top bar.
 */
export abstract class AppShellPage extends BasePage {
  public get switchCompanyRow() {
    return this.page.getByRole("button", { name: /^Switch Company\b/ });
  }

  /**
   * Switch Company with `name` as the Active Company: the row says so in its
   * accessible name (ADR-0051), which is what these specs read.
   */
  public activeCompanyRow(name: string) {
    return this.page.getByRole("button", {
      name: `Switch Company. Active Company: ${name}`,
      exact: true,
    });
  }

  public get accountMenuButton() {
    return this.page.getByRole("button", { name: /^Account menu for / });
  }

  /**
   * The bell sits in the sidebar's account row from `md` up and in the
   * phone bar below it (ADR-0050); there is no banner landmark on a wide
   * screen, so find it by name.
   */
  public get notificationsButton() {
    return this.page.getByRole("button", { name: /^Notifications/ }).first();
  }

  /**
   * On a phone the sidebar is a sheet behind "Toggle Sidebar" (ADR-0050),
   * so Switch Company, the account menu and the sidebar bell exist only once
   * it is open; on a desktop it is always open and this does nothing.
   */
  public async openSidebar() {
    const trigger = this.page.getByRole("button", { name: "Toggle Sidebar" });
    if (await trigger.isVisible()) await trigger.click();
  }

  public async switchCompany(name: string) {
    await this.switchCompanyRow.click();
    await this.page
      .getByRole("dialog", { name: "Switch Company" })
      .getByRole("button", { name })
      .click();
  }

  public async signOut() {
    await this.accountMenuButton.click();
    await this.menuItem("Sign out").click();
  }
}
