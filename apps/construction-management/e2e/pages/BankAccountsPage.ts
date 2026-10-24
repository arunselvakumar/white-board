import { AppShellPage } from "./AppShellPage";

/** Masters → Company's Bank A/C: accounts and their balances (CM-701). */
export class BankAccountsPage extends AppShellPage {
  public get url() {
    return "/app/masters/bank-accounts";
  }

  public account(name: string) {
    return this.page
      .getByRole("list", { name: "Company accounts" })
      .getByRole("listitem")
      .filter({ has: this.page.getByRole("link", { name, exact: true }) });
  }
}
