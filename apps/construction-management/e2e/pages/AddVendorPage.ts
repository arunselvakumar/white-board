import { AppShellPage } from "./AppShellPage";

export class AddVendorPage extends AppShellPage {
  public get url() {
    return "/app/vendors/new";
  }

  public async fill(input: {
    name: string;
    project: string;
    category: string;
    ratePerDay: string;
  }) {
    await this.field("Vendor name").fill(input.name);
    await this.page.getByRole("checkbox", { name: input.project }).check();
    await this.choose("Shift 1 category 1 Labour Category", input.category);
    await this.field("Shift 1 category 1 rate per day").fill(input.ratePerDay);
  }

  public get saveButton() {
    return this.button("Save");
  }
}
