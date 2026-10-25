import { ProjectPage } from "./ProjectPage";

/** Add Purchase Request (3 steps) and the Purchase Request it opens. */
export class PurchaseRequestPage extends ProjectPage {
  public get url() {
    return `${this.base}/materials/purchase-requests/new`;
  }

  public async addMaterial(name: string) {
    await this.page.getByRole("combobox", { name: "Add a material" }).click();
    await this.page
      .getByRole("option", { name: new RegExp(`^${name}`) })
      .first()
      .click();
  }

  public get nextButton() {
    return this.button("Next");
  }

  public quantity(material: string) {
    return this.field(`Quantity of ${material}`);
  }

  public async create(input: {
    material: string;
    quantity: string;
    requiredDate: string;
  }) {
    await this.addMaterial(input.material);
    await this.nextButton.click();
    await this.quantity(input.material).fill(input.quantity);
    await this.nextButton.click();
    await this.field("Required Date").fill(input.requiredDate);
    await this.button("Save & Approve").click();
  }

  /** The PR / PO / GRN number heading of a document page. */
  public get documentNumber() {
    return this.heading(/^(PR|PO|GRN)\//);
  }
}
