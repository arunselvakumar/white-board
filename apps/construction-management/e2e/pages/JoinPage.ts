import type { Page } from "@playwright/test";

import { BasePage } from "./BasePage";

/** The invite link a Team Member opens (`/join/<token>`, CM-109). */
export class JoinPage extends BasePage {
  constructor(
    page: Page,
    private readonly path = "/join",
  ) {
    super(page);
  }

  public get url() {
    return this.path;
  }

  public joinButton(companyName: string) {
    return this.button(`Join ${companyName}`);
  }

  public get declineButton() {
    return this.button("Decline");
  }

  public get createAccountLink() {
    return this.link("Create an account");
  }
}
