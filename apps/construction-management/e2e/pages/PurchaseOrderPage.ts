import { ProjectPage } from "./ProjectPage";

/** Add Purchase Order and the Purchase Order it opens. */
export class PurchaseOrderPage extends ProjectPage {
  public get url() {
    return `${this.base}/materials/purchase-orders/new`;
  }

  public get grandTotal() {
    return this.page.getByTestId("po-grand-total");
  }

  public async addLine(material: string, quantity: string) {
    await this.button("Add Materials").click();
    const sheet = this.page.getByRole("dialog");
    await sheet.getByRole("combobox", { name: "Material" }).click();
    await this.page
      .getByRole("option", { name: new RegExp(`^${material}`) })
      .first()
      .click();
    await sheet.getByLabel(/^Quantity/).fill(quantity);
    await sheet.getByRole("button", { name: "Add", exact: true }).click();
    await sheet.waitFor({ state: "detached" });
  }

  public async fillHeader(input: {
    supplier: string;
    expectedDelivery: string;
  }) {
    await this.choose("Supplier", input.supplier);
    await this.field("Expected Delivery Date").fill(input.expectedDelivery);
  }

  public get saveAndApproveButton() {
    return this.button("Save & Approve");
  }

  public get documentNumber() {
    return this.heading(/^PO\//);
  }
}
