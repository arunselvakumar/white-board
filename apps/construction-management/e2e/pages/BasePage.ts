import type { Locator, Page } from "@playwright/test";

/**
 * A screen of Construction Management. Page objects expose locators by role
 * and label in the words of CONTEXT.md, plus the few actions a spec repeats.
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  public abstract get url(): string;

  public get currentPage() {
    return this.page;
  }

  public async goto() {
    await this.page.goto(this.url);
  }

  public heading(name: string | RegExp, options: { level?: number } = {}) {
    return this.page.getByRole("heading", { name, ...options });
  }

  /** A button by its exact name (a string) or a pattern. */
  public button(name: string | RegExp): Locator {
    return this.page.getByRole("button", {
      name,
      exact: typeof name === "string",
    });
  }

  /** A link by its exact name (a string) or a pattern. */
  public link(name: string | RegExp): Locator {
    return this.page.getByRole("link", {
      name,
      exact: typeof name === "string",
    });
  }

  /** A form control by its exact label (a string) or a pattern. */
  public field(label: string | RegExp): Locator {
    return this.page.getByLabel(label, { exact: typeof label === "string" });
  }

  public get main(): Locator {
    return this.page.getByRole("main");
  }

  public get dialog(): Locator {
    return this.page.getByRole("dialog");
  }

  /** A confirmation (AlertDialog), e.g. "Delete …?". */
  public get alertDialog(): Locator {
    return this.page.getByRole("alertdialog");
  }

  /** An inline status message, e.g. "Company profile saved." */
  public status(text: string | RegExp): Locator {
    return this.page.getByRole("status").filter({ hasText: text }).first();
  }

  /** A toast (Sonner) with this text. */
  public toast(text: string | RegExp): Locator {
    return this.page
      .locator("[data-sonner-toast]")
      .filter({ hasText: text })
      .first();
  }

  /** Picks `option` in the Select or Combobox labelled `label`. */
  public async choose(label: string | RegExp, option: string | RegExp) {
    await this.page.getByRole("combobox", { name: label }).click();
    await this.page.getByRole("option", { name: option }).first().click();
  }

  public menuItem(name: string | RegExp): Locator {
    return this.page.getByRole("menuitem", {
      name,
      exact: typeof name === "string",
    });
  }

  /** Clicks `button` and waits for the API call it makes to succeed. */
  public async clickAndWaitFor(button: Locator, apiPath: string | RegExp) {
    const response = this.page.waitForResponse(
      (candidate) =>
        candidate.request().method() !== "GET" &&
        (typeof apiPath === "string"
          ? candidate.url().includes(apiPath)
          : apiPath.test(candidate.url())),
    );
    await button.click();
    const answered = await response;
    if (!answered.ok())
      throw new Error(
        `${answered.url()} → ${String(answered.status())}: ${await answered.text()}`,
      );
  }

  /** The "Actions for …" menu of a row, opened, then one of its items. */
  public async rowAction(rowName: string, item: string | RegExp) {
    await this.page
      .getByRole("button", { name: `Actions for ${rowName}` })
      .click();
    await this.menuItem(item).click();
  }

  /** Sets the files of the (often hidden) file input labelled `label`. */
  public async upload(
    label: string | RegExp,
    files:
      | string
      | string[]
      | { name: string; mimeType: string; buffer: Buffer }
      | { name: string; mimeType: string; buffer: Buffer }[],
  ) {
    await this.page.getByLabel(label).setInputFiles(files);
  }

  public get mainMenu(): Locator {
    return this.page.getByRole("navigation").first();
  }

  public menuLink(name: string | RegExp): Locator {
    return this.mainMenu.getByRole("link", { name });
  }
}
