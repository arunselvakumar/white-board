import type { Page } from "@playwright/test";

import { ProjectPage } from "./ProjectPage";

/** Payments → Suppliers / Contractors / Other Parties: balances and payments. */
export class PartyPaymentsPage extends ProjectPage {
  constructor(
    page: Page,
    projectId: string,
    private readonly kind: "suppliers" | "contractors" | "other-parties",
  ) {
    super(page, projectId);
  }

  public get url() {
    return `${this.base}/payments/${this.kind}`;
  }

  public get balances() {
    return this.page.getByRole("tabpanel", { name: "Balances" });
  }

  public balance(party: string) {
    return this.balances.getByRole("row").filter({ hasText: party }).first();
  }

  /** One amount of a party's balance row, by its column ("Invoiced", "Balance"…). */
  public async amount(party: string, column: string) {
    await this.balance(party).waitFor();
    const headers = await this.balances
      .getByRole("columnheader")
      .allTextContents();
    const index = headers.findIndex((header) => header.trim() === column);
    if (index < 0)
      throw new Error(`No ${column} column in ${headers.join(", ")}`);
    return this.balance(party).locator("td, th").nth(index);
  }

  /** Record payment: the party, an amount spread over open invoices by Fill. */
  public async pay(input: { party: string; label: string; amount: string }) {
    await this.link("Record payment").click();
    await this.choose(input.label, input.party);
    await this.field("Amount").fill(input.amount);
    await this.button("Fill").click();
    await this.button(/^Record ₹/).click();
  }
}
