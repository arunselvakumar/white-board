import { test } from "@playwright/test";

import { createOwner, type Owner } from "../api/owner";

/**
 * The base of signed-out tests: `page` has no session. `account` is a User
 * who already owns a Company, for the specs that sign in on the screens.
 */
export const guestTest = test.extend<{ account: Owner }>({
  account: async ({ playwright, baseURL }, use) => {
    const owner = await createOwner(playwright, baseURL ?? "");
    await use(owner);
    await owner.api.request.dispose();
  },
});
