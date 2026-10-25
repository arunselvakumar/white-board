import { ProjectPage } from "./ProjectPage";

export class AddWingPage extends ProjectPage {
  public get url() {
    return `${this.base}/wings/new`;
  }

  public get wingNameField() {
    return this.field("Wing Name");
  }

  public get continueToUnitsButton() {
    return this.button("Continue to Units");
  }

  /** A Residential Wing: the ground floor and `floors` above, no terrace. */
  public async createResidential(
    name: string,
    floors: number,
    unitsPerFloor: number,
  ) {
    await this.goto();
    await this.choose("Wing Type", "Residential");
    await this.wingNameField.fill(name);
    await this.field("Residential floors").fill(String(floors));
    await this.field("Units per floor").fill(String(unitsPerFloor));
    await this.page.getByRole("switch", { name: "Terrace floor" }).uncheck();
    await this.continueToUnitsButton.click();
    await this.button("Save Wing").click();
    await this.page.waitForURL(`${this.base}/wings`);
  }
}
