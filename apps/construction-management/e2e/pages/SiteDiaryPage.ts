import { ProjectPage } from "./ProjectPage";

/** Site Diary: the list and "Write the diary" (CM-607). */
export class SiteDiaryPage extends ProjectPage {
  public get url() {
    return `${this.base}/site-diary/new`;
  }

  public get form() {
    return this.page.getByRole("form", { name: "New Site Diary" });
  }

  public async write(input: {
    notes: string;
    weather?: string;
    photo?: string;
  }) {
    if (input.weather != null)
      await this.choose("Weather (morning)", input.weather);
    await this.form.getByLabel("Notes").fill(input.notes);
    if (input.photo != null)
      await this.form
        .getByLabel("Choose photos for Photos")
        .setInputFiles(input.photo);
    await this.form.getByRole("button", { name: "Save", exact: true }).click();
  }
}
