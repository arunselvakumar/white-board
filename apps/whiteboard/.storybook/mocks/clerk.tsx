import type { ReactNode } from "react";
import { fn } from "storybook/test";

export type ClerkFieldError = {
  code?: string;
  message?: string;
  longMessage?: string;
};

export type ClerkMembership = {
  organization: {
    id: string;
    name: string;
  };
};

type AsyncFn = ReturnType<typeof fn>;

export type ClerkMockState = {
  isSignedIn: boolean;
  orgId: string | null;
  fetchStatus: "idle" | "fetching";
  organizationListLoaded: boolean;
  membershipsLoading: boolean;
  memberships: ClerkMembership[];
  errors: {
    fields: Record<string, ClerkFieldError | null | undefined>;
    global: ClerkFieldError[] | null;
  };
  signIn: {
    status: string;
    password: AsyncFn;
    create: AsyncFn;
    finalize: AsyncFn;
    sso: AsyncFn;
    mfa: {
      sendEmailCode: AsyncFn;
      verifyEmailCode: AsyncFn;
    };
    resetPasswordEmailCode: {
      sendCode: AsyncFn;
      verifyCode: AsyncFn;
      submitPassword: AsyncFn;
    };
  };
  signUp: {
    status: string;
    unverifiedFields: string[];
    password: AsyncFn;
    finalize: AsyncFn;
    sso: AsyncFn;
    verifications: {
      sendEmailCode: AsyncFn;
      verifyEmailCode: AsyncFn;
    };
  };
  createOrganization: AsyncFn;
  setActive: AsyncFn;
};

function ok(): { error: null } {
  return { error: null };
}

function createState(): ClerkMockState {
  const signIn: ClerkMockState["signIn"] = {
    status: "needs_first_factor",
    password: fn().mockName("signIn.password"),
    create: fn(() => ok()).mockName("signIn.create"),
    finalize: fn(() => undefined).mockName("signIn.finalize"),
    sso: fn(() => undefined).mockName("signIn.sso"),
    mfa: {
      sendEmailCode: fn(() => ok()).mockName("signIn.mfa.sendEmailCode"),
      verifyEmailCode: fn().mockName("signIn.mfa.verifyEmailCode"),
    },
    resetPasswordEmailCode: {
      sendCode: fn(() => ok()).mockName(
        "signIn.resetPasswordEmailCode.sendCode",
      ),
      verifyCode: fn(() => ok()).mockName(
        "signIn.resetPasswordEmailCode.verifyCode",
      ),
      submitPassword: fn().mockName(
        "signIn.resetPasswordEmailCode.submitPassword",
      ),
    },
  };
  signIn.password.mockImplementation(() => {
    signIn.status = "complete";
    return ok();
  });
  signIn.mfa.verifyEmailCode.mockImplementation(() => {
    signIn.status = "complete";
    return ok();
  });
  signIn.resetPasswordEmailCode.submitPassword.mockImplementation(() => {
    signIn.status = "complete";
    return ok();
  });

  const signUp: ClerkMockState["signUp"] = {
    status: "missing_requirements",
    unverifiedFields: ["email_address"],
    password: fn(() => ok()).mockName("signUp.password"),
    finalize: fn(() => undefined).mockName("signUp.finalize"),
    sso: fn(() => undefined).mockName("signUp.sso"),
    verifications: {
      sendEmailCode: fn(() => ok()).mockName(
        "signUp.verifications.sendEmailCode",
      ),
      verifyEmailCode: fn().mockName("signUp.verifications.verifyEmailCode"),
    },
  };
  signUp.verifications.verifyEmailCode.mockImplementation(() => {
    signUp.status = "complete";
    return ok();
  });

  return {
    isSignedIn: false,
    orgId: null,
    fetchStatus: "idle",
    organizationListLoaded: true,
    membershipsLoading: false,
    memberships: [],
    errors: { fields: {}, global: null },
    signIn,
    signUp,
    createOrganization: fn((input: { name: string }) => ({
      id: "org_new",
      name: input.name,
    })).mockName("createOrganization"),
    setActive: fn(() => undefined).mockName("setActive"),
  };
}

export const clerkMocks: ClerkMockState = createState();

export function resetClerkMocks(): void {
  const next = createState();
  clerkMocks.isSignedIn = next.isSignedIn;
  clerkMocks.orgId = next.orgId;
  clerkMocks.fetchStatus = next.fetchStatus;
  clerkMocks.organizationListLoaded = next.organizationListLoaded;
  clerkMocks.membershipsLoading = next.membershipsLoading;
  clerkMocks.memberships = next.memberships;
  clerkMocks.errors = next.errors;
  clerkMocks.signIn = next.signIn;
  clerkMocks.signUp = next.signUp;
  clerkMocks.createOrganization = next.createOrganization;
  clerkMocks.setActive = next.setActive;
}

export function useAuth() {
  return {
    isSignedIn: clerkMocks.isSignedIn,
    orgId: clerkMocks.orgId,
  };
}

export function useSignIn() {
  return {
    signIn: clerkMocks.signIn,
    errors: clerkMocks.errors,
    fetchStatus: clerkMocks.fetchStatus,
  };
}

export function useSignUp() {
  return {
    signUp: clerkMocks.signUp,
    errors: clerkMocks.errors,
    fetchStatus: clerkMocks.fetchStatus,
  };
}

export function useOrganizationList(_options?: unknown) {
  return {
    isLoaded: clerkMocks.organizationListLoaded,
    createOrganization: clerkMocks.createOrganization,
    setActive: clerkMocks.setActive,
    userMemberships: {
      count: clerkMocks.memberships.length,
      data: clerkMocks.memberships,
      isLoading: clerkMocks.membershipsLoading,
    },
  };
}

export function useOrganization() {
  const membership = clerkMocks.memberships.find(
    (item) => item.organization.id === clerkMocks.orgId,
  );
  return {
    isLoaded: clerkMocks.organizationListLoaded,
    organization: membership?.organization ?? null,
  };
}

export function SignOutButton({ children }: { children: ReactNode }) {
  return children;
}

export function UserButton() {
  return (
    <button type="button" aria-label="Open user menu">
      Account
    </button>
  );
}

export function ClerkProvider({ children }: { children: ReactNode }) {
  return children;
}
