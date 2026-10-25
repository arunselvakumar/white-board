import { ProjectPage } from "./ProjectPage";

/** Payments → Wages: Labour and Vendor balances and payments. */
export class WagesPage extends ProjectPage {
  public get url() {
    return `${this.base}/payments/wages`;
  }

  public tab(name: "Labour" | "Vendor" | "Payments") {
    return this.page.getByRole("tab", { name });
  }

  public get labourBalances() {
    return this.page.getByRole("table", { name: "Labour balances" });
  }

  public balanceRow(name: string) {
    return this.page
      .getByRole("row")
      .or(this.page.getByRole("listitem"))
      .filter({ hasText: name })
      .first();
  }

  /**
   * One amount of a balance ("To Pay", "Paid", "Final Amount"…): a table
   * column on a wide screen, a labelled card on a phone.
   */
  public amount(
    name: string,
    label: "Previous Balance" | "To Pay" | "Advance" | "Paid" | "Final Amount",
  ) {
    const table = this.page.getByRole("table", { name: "Labour balances" });
    const column =
      ["Previous Balance", "To Pay", "Advance", "Paid", "Final Amount"].indexOf(
        label,
      ) + 1;
    const cell = table
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("cell")
      .nth(column);
    const card = this.page
      .getByRole("list", { name: "Labour balances" })
      .getByRole("listitem")
      .filter({ hasText: name });
    const definition =
      label === "Final Amount"
        ? card
            .getByText("Final Amount", { exact: true })
            .locator("xpath=following-sibling::*[1]")
        : card
            .getByRole("term")
            .filter({ hasText: new RegExp(`^${label}$`) })
            .locator("xpath=following-sibling::*[1]");
    return cell.or(definition);
  }

  public async pay(
    name: string,
    input: { amount?: string; mode?: "Cash" | "Bank" } = {},
  ) {
    await this.button(`Pay ${name}`).click();
    const dialog = this.page.getByRole("dialog", { name: `Pay ${name}` });
    if (input.amount != null)
      await dialog.getByLabel("Amount").fill(input.amount);
    if (input.mode != null)
      await dialog.getByRole("radio", { name: input.mode }).click();
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await dialog.waitFor({ state: "detached" });
  }
}
