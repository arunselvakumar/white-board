import { ProjectPage } from "./ProjectPage";

/** Record Goods Receipt (GRN), against a Purchase Order or standalone. */
export class GoodsReceiptPage extends ProjectPage {
  public get url() {
    return `${this.base}/materials/goods-received/new`;
  }

  public async choosePurchaseOrder(number: string | RegExp) {
    await this.choose("Purchase Order", number);
  }

  public receivedNow(material: string) {
    return this.field(`Received now, ${material}`);
  }

  public get invoiceNoField() {
    return this.field("Invoice No");
  }

  public get saveButton() {
    return this.button("Save Goods Receipt");
  }

  public get documentNumber() {
    return this.heading(/^GRN\//);
  }
}
