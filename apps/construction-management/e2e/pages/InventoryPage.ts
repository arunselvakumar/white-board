import { ProjectPage } from "./ProjectPage";

/** Materials → Current Inventory of a Project. */
export class InventoryPage extends ProjectPage {
  public get url() {
    return `${this.base}/materials/inventory`;
  }

  public row(material: string) {
    return this.page.getByRole("row").filter({ hasText: material }).first();
  }
}
