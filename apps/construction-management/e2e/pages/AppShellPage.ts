import { BasePage } from "./BasePage";

/**
 * The signed-in shell around every /app screen: the sidebar (Company
 * switcher, account row, main menu) and, on a phone, its slim top bar.
 */
export abstract class AppShellPage extends BasePage {
  public get companySwitcher() {
    return this.page.getByRole("button", { name: /^Active Company: / });
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
   * so the switcher, the account menu and the sidebar bell exist only once
   * it is open; on a desktop it is always open and this does nothing.
   */
  public async openSidebar() {
    const trigger = this.page.getByRole("button", { name: "Toggle Sidebar" });
    if (await trigger.isVisible()) await trigger.click();
  }

  public async switchCompany(name: string) {
    await this.companySwitcher.click();
    await this.menuItem(name).click();
  }

  public async signOut() {
    await this.accountMenuButton.click();
    await this.menuItem("Sign out").click();
  }
}
