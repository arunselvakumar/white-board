/**
 * Storybook stand-in for `@repo/auth/construction/react` (aliased in
 * .storybook/main.ts). Stories set `authMocks` fields before rendering and
 * assert on its `fn()`s. Hooks keep the real ones' shapes: every action
 * resolves `{ error }`.
 */
import { useState, type ReactNode } from "react";
import { fn } from "storybook/test";

import type {
  AuthError,
  AuthResult,
  CompanyAuthSnapshot,
  CompanyAuthUser,
  CompanyRole,
  CompanySummary,
  FetchStatus,
} from "@repo/auth/construction/react";

export type {
  AuthError,
  AuthResult,
  CompanyAuthSnapshot,
  CompanyAuthUser,
  CompanyRole,
  CompanySummary,
  FetchStatus,
};

type Action<Args extends unknown[]> = ReturnType<
  typeof fn<(...args: Args) => Promise<AuthResult>>
>;

export type AuthMockState = {
  userId: string | null;
  workspaceId: string | null;
  role: CompanyRole | null;
  user: CompanyAuthUser | null;
  companies: CompanySummary[];
  emailSignIn: Action<[{ email: string; password: string }]>;
  emailSignUp: {
    create: Action<[{ name: string; email: string; password: string }]>;
    verifyEmailCode: Action<[{ email: string; code: string }]>;
  };
  setActive: Action<[string, string]>;
  signOut: Action<[string]>;
  navigateInApp: ReturnType<typeof fn<(path: string) => void>>;
};

const ok = (): Promise<AuthResult> => Promise.resolve({ error: null });

/** An auth error result, as the real hooks resolve it. */
export function authFailure(
  code: string,
  status = 400,
  message = "",
): Promise<AuthResult> {
  return Promise.resolve({ error: { code, message, status } });
}

export const storyUser: CompanyAuthUser = {
  id: "user_owner",
  name: "Ramesh Patil",
  email: "ramesh@patilbuilders.in",
  emailVerified: true,
  image: null,
};

function action<Args extends unknown[]>(name: string): Action<Args> {
  return fn<(...args: Args) => Promise<AuthResult>>(ok).mockName(name);
}

function createState(): AuthMockState {
  return {
    userId: null,
    workspaceId: null,
    role: null,
    user: null,
    companies: [],
    emailSignIn: action("emailSignIn"),
    emailSignUp: {
      create: action("emailSignUp.create"),
      verifyEmailCode: action("emailSignUp.verifyEmailCode"),
    },
    setActive: action("setActive"),
    signOut: action("signOut"),
    navigateInApp: fn<(path: string) => void>().mockName("navigateInApp"),
  };
}

export const authMocks: AuthMockState = createState();

export function resetAuthMocks(): void {
  Object.assign(authMocks, createState());
}

/** Signs the story in as `role` in a Company. */
export function signInAs(
  role: CompanyRole,
  company: { id?: string; name?: string } = {},
): void {
  const summary: CompanySummary = {
    id: company.id ?? "company_patil",
    name: company.name ?? "Patil Builders",
    role,
  };
  authMocks.userId = storyUser.id;
  authMocks.user = storyUser;
  authMocks.workspaceId = summary.id;
  authMocks.role = role;
  authMocks.companies = [summary];
}

export function navigateInApp(path: string): void {
  authMocks.navigateInApp(path);
}

export function CompanyAuthProvider({
  children,
}: {
  snapshot: CompanyAuthSnapshot;
  children: ReactNode;
}) {
  return <>{children}</>;
}

export function useCompanyAuthSnapshot(): CompanyAuthSnapshot {
  return {
    userId: authMocks.userId,
    workspaceId: authMocks.workspaceId,
    role: authMocks.role,
    user: authMocks.user,
    companies: authMocks.companies,
  };
}

export function useCompanyAuth() {
  return {
    isSignedIn: authMocks.userId != null,
    userId: authMocks.userId,
    workspaceId: authMocks.workspaceId,
    role: authMocks.role,
  };
}

export function useCompanyUser() {
  return { user: authMocks.user };
}

export function useActiveCompany() {
  return {
    company:
      authMocks.companies.find(
        (company) => company.id === authMocks.workspaceId,
      ) ?? null,
  };
}

function useMockAction<Args extends unknown[]>(
  call: (...args: Args) => Promise<AuthResult>,
) {
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<AuthError | null>(null);
  const run = async (...args: Args): Promise<AuthResult> => {
    setFetchStatus("fetching");
    const result = await call(...args);
    setError(result.error);
    setFetchStatus("idle");
    return result;
  };
  return {
    run,
    fetchStatus,
    error,
    clearError: () => {
      setError(null);
    },
  };
}

export function useCompanyList() {
  const { run, fetchStatus, error } = useMockAction(
    async (workspaceId: string, redirectTo: string) => {
      const result = await authMocks.setActive(workspaceId, redirectTo);
      if (result.error == null) navigateInApp(redirectTo);
      return result;
    },
  );
  return {
    companies: authMocks.companies,
    setActive: run,
    fetchStatus,
    error,
  };
}

export function useCompanyEmailSignIn() {
  const { run, fetchStatus, error, clearError } = useMockAction(
    (input: { email: string; password: string }) =>
      authMocks.emailSignIn(input),
  );
  return { signIn: run, fetchStatus, error, clearError };
}

export function useCompanyEmailSignUp() {
  const create = useMockAction(
    (input: { name: string; email: string; password: string }) =>
      authMocks.emailSignUp.create(input),
  );
  const verify = useMockAction((input: { email: string; code: string }) =>
    authMocks.emailSignUp.verifyEmailCode(input),
  );
  return {
    create: create.run,
    verifyEmailCode: verify.run,
    fetchStatus:
      create.fetchStatus === "fetching" || verify.fetchStatus === "fetching"
        ? ("fetching" as const)
        : ("idle" as const),
    error: create.error ?? verify.error,
    clearError: () => {
      create.clearError();
      verify.clearError();
    },
  };
}

export function useCompanySignOut() {
  const { run, fetchStatus } = useMockAction(async (redirectTo?: string) => {
    const target = redirectTo ?? "/sign-in";
    const result = await authMocks.signOut(target);
    navigateInApp(target);
    return result;
  });
  return {
    signOut: async (redirectTo?: string) => {
      await run(redirectTo);
    },
    fetchStatus,
  };
}
