import { ProjectPage } from "./ProjectPage";

/** Locations: how a non-building Project is divided (CM-405). */
export class LocationsPage extends ProjectPage {
  public get url() {
    return `${this.base}/locations`;
  }

  public get addLocationButton() {
    return this.button("Add Location").first();
  }

  public get locations() {
    return this.page.getByRole("list", { name: "Locations" });
  }

  public async addLocation(name: string) {
    await this.addLocationButton.click();
    await this.dialog.getByLabel("Location name").fill(name);
    await this.dialog.getByRole("button", { name: "Save" }).click();
  }
}
