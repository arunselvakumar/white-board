import { AppShellPage } from "./AppShellPage";

export class CheckoutPage extends AppShellPage {
  public get url() {
    return "/app/subscription/checkout";
  }

  public get pageHeading() {
    return this.heading("Choose a plan", { level: 1 });
  }

  public get step() {
    return this.page.getByText(/^Step \d of \d/);
  }

  public plan(name: string) {
    return this.page.getByRole("radio", { name: new RegExp(`^${name}`) });
  }

  public get continueButton() {
    return this.button("Continue");
  }

  public get payButton() {
    return this.button(/^Pay/);
  }

  /** Steps to Buyer details, fills them, and stops on the last step. */
  public async continueToPay(buyer: { name: string; address: string }) {
    while (!(await this.step.textContent())?.includes("Buyer details"))
      await this.continueButton.click();
    await this.field("Billing name").fill(buyer.name);
    await this.field("Billing address").fill(buyer.address);
    await this.choose("State", "Tamil Nadu");
    await this.continueButton.click();
  }
}
