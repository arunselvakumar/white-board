import { BasePage } from "./BasePage";

/** The signed-in shell around every /app screen: main menu and header. */
export abstract class AppShellPage extends BasePage {
  public get companySwitcher() {
    return this.page.getByRole("button", { name: /^Active Company: / });
  }

  public get accountMenuButton() {
    return this.page.getByRole("button", { name: /^Account menu for / });
  }

  public get notificationsButton() {
    return this.page
      .getByRole("banner")
      .getByRole("button", { name: /Notifications/ });
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
