import type { Locator } from "@playwright/test";

import { ProjectPage } from "./ProjectPage";

/** Attendance → Check-In: find a person, then check them in or out (ADR CM-0043). */
export class CheckInPage extends ProjectPage {
  public get url() {
    return `${this.base}/attendance/check-in`;
  }

  public get searchBox() {
    return this.page.getByRole("searchbox", { name: "Search people" });
  }

  public group(name: "Site Engineers" | "Labours" | "Vendors") {
    return this.page.getByRole("region", { name });
  }

  /** A person's card: their name, role, ID, phone and today's state. */
  public person(name: string) {
    return this.page.getByRole("link", { name: new RegExp(name) });
  }

  /** The capture screen, which covers the whole window. */
  public capture(name: string) {
    return this.page.getByRole("dialog", { name });
  }

  public get turnOnCameraButton() {
    return this.button("Turn on camera");
  }

  public get entrySelect() {
    return this.page.getByRole("combobox", { name: "Entry" });
  }

  public submitButton(action: "Check In" | "Check Out"): Locator {
    return this.button(action);
  }

  public get doneButton() {
    return this.button("Done, back to the search");
  }

  /** Opens `name`, turns the camera on and submits `action`. */
  public async record(name: string, action: "Check In" | "Check Out") {
    await this.person(name).click();
    const capture = this.capture(name);
    await this.turnOnCameraButton.click();
    await this.clickAndWaitFor(
      capture.getByRole("button", { name: action, exact: true }),
      "/attendance/check-ins",
    );
  }
}
