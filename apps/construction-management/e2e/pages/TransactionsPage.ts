import { ProjectPage } from "./ProjectPage";

/** Payments → Transactions: money in or out that is not a party payment. */
export class TransactionsPage extends ProjectPage {
  public get url() {
    return `${this.base}/payments/transactions`;
  }

  public async record(input: {
    direction: "Payment In" | "Payment Out";
    amount: string;
    account?: string;
    description?: string;
  }) {
    await this.button("New transaction").first().click();
    const dialog = this.page.getByRole("dialog", { name: "New transaction" });
    await dialog
      .getByRole("button", { name: input.direction, exact: true })
      .click();
    if (input.account != null)
      await this.choose(
        input.direction === "Payment In" ? "Received into" : "Paid from",
        input.account,
      );
    await dialog.getByLabel("Amount").fill(input.amount);
    if (input.description != null)
      await dialog.getByLabel("Description").fill(input.description);
    await dialog.getByRole("button", { name: "Save & Approve" }).click();
    await dialog.waitFor({ state: "detached" });
  }
}
