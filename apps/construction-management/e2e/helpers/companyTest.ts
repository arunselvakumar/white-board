import {
  test,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

import { ApiClient } from "../api/ApiClient";
import {
  addMember,
  createRole,
  roleId,
  type Grants,
  type Member,
} from "../api/organization";
import { createOwner, type Owner } from "../api/owner";
import {
  newApiSession,
  newMobile,
  signInByEmail,
  signInFirstTime,
} from "../api/session";

/** A member who has signed in and chosen their own password. */
export type SignedInMember = Member & {
  mobile: string;
  /** Their API session. */
  api: ApiClient;
  /** A page signed in as them, in its own browser context. */
  page: (options?: BrowserContextOptions) => Promise<Page>;
};

type CompanyFixtures = {
  /** A fresh Owner with a fresh Company: every test gets its own. */
  owner: Owner;
  /** An API session for another User, signed in by email. */
  apiFor: (account: { email: string; password?: string }) => Promise<ApiClient>;
  /** A signed-in page for another User, in its own browser context. */
  pageFor: (account: { email: string; password?: string }) => Promise<Page>;
  /**
   * A member of the Owner's Company on a Role with exactly `grants` (or the
   * seed Role `roleName`), on `projectIds`, already past the first sign-in.
   */
  newMember: (input: {
    grants?: Grants;
    roleName?: string;
    projectIds?: string[];
    memberType?: "normal" | "hrms";
    name?: string;
  }) => Promise<SignedInMember>;
};

/**
 * The base of every signed-in test: `page` is the Owner's, already signed in
 * with their Company active (arranged through the API, not the screens).
 */
export const companyTest = test.extend<CompanyFixtures>({
  owner: async ({ playwright, baseURL }, use) => {
    const owner = await createOwner(playwright, baseURL ?? "");
    await use(owner);
    await owner.api.request.dispose();
  },

  storageState: async ({ owner }, use) => {
    await use(await owner.api.request.storageState());
  },

  apiFor: async ({ playwright, baseURL }, use) => {
    const sessions: ApiClient[] = [];
    await use(async ({ email, password }) => {
      const request = await newApiSession(playwright, baseURL ?? "");
      await signInByEmail(request, email, password);
      const api = new ApiClient(request);
      sessions.push(api);
      return api;
    });
    for (const api of sessions) await api.request.dispose();
  },

  pageFor: async ({ browser, apiFor }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (account) => {
      const api = await apiFor(account);
      const context = await browser.newContext({
        storageState: await api.request.storageState(),
      });
      contexts.push(context);
      return context.newPage();
    });
    for (const context of contexts) await context.close();
  },

  newMember: async ({ owner, playwright, baseURL, browser }, use) => {
    const sessions: ApiClient[] = [];
    const contexts: BrowserContext[] = [];
    await use(async (input) => {
      const role =
        input.roleName != null
          ? await roleId(owner.api, input.roleName)
          : (await createRole(owner.api, input.grants ?? {})).id;
      const member = await addMember(owner.api, {
        roleId: role,
        projectIds: input.projectIds,
        memberType: input.memberType,
        name: input.name,
        mobile: newMobile(),
      });
      const mobile = member.mobile ?? "";
      const request = await newApiSession(playwright, baseURL ?? "");
      await signInFirstTime(request, mobile, member.password);
      const api = new ApiClient(request);
      sessions.push(api);
      return {
        ...member,
        mobile,
        api,
        page: async (options = {}) => {
          const context = await browser.newContext({
            ...options,
            storageState: await request.storageState(),
          });
          contexts.push(context);
          return context.newPage();
        },
      };
    });
    for (const context of contexts) await context.close();
    for (const api of sessions) await api.request.dispose();
  },
});
