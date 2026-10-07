/**
 * Storybook stand-in for `@repo/auth/react` (aliased in .storybook/main.ts).
 * Stories set `authMocks` fields before rendering and assert on its `fn()`s.
 * The hooks keep the real ones' shapes: every action resolves `{ error }`,
 * and `fetchStatus` / `error` update like the real hooks.
 */
import { useCallback, useState, type ReactNode } from "react";
import { fn } from "storybook/test";

import type {
  AuthError,
  AuthResult,
  AuthSnapshot,
  AuthUser,
  FetchStatus,
  WorkspaceRole,
  WorkspaceSummary,
} from "@repo/auth/react";

export type {
  AuthError,
  AuthResult,
  AuthSnapshot,
  AuthUser,
  FetchStatus,
  WorkspaceRole,
  WorkspaceSummary,
};

type Action<Args extends unknown[]> = ReturnType<
  typeof fn<(...args: Args) => Promise<AuthResult>>
>;

export type AuthMockState = {
  userId: string | null;
  workspaceId: string | null;
  role: WorkspaceRole | null;
  user: AuthUser | null;
  workspaces: WorkspaceSummary[];
  signIn: {
    password: Action<[{ identifier: string; password: string }]>;
    google: Action<[string]>;
  };
  signUp: {
    create: Action<[{ username: string; email: string; password: string }]>;
    sendEmailCode: Action<[string]>;
    verifyEmailCode: Action<[{ email: string; code: string }]>;
  };
  passwordReset: {
    sendCode: Action<[string]>;
    reset: Action<[{ email: string; code: string; password: string }]>;
  };
  acceptInvitation: Action<[string]>;
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

export const storyUser: AuthUser = {
  id: "user_owner",
  name: "Arun",
  email: "arun@example.com",
  emailVerified: true,
  username: "arun",
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
    workspaces: [],
    signIn: {
      password: action("signIn.password"),
      google: action("signIn.google"),
    },
    signUp: {
      create: action("signUp.create"),
      sendEmailCode: action("signUp.sendEmailCode"),
      verifyEmailCode: action("signUp.verifyEmailCode"),
    },
    passwordReset: {
      sendCode: action("passwordReset.sendCode"),
      reset: action("passwordReset.reset"),
    },
    acceptInvitation: action("acceptInvitation"),
    setActive: action("setActive"),
    signOut: action("signOut"),
    navigateInApp: fn<(path: string) => void>().mockName("navigateInApp"),
  };
}

export const authMocks: AuthMockState = createState();

export function resetAuthMocks(): void {
  Object.assign(authMocks, createState());
}

/** Signs the story in as `role` in a Workspace named `name`. */
export function signInAs(
  role: WorkspaceRole,
  workspace: { id?: string; name?: string } = {},
): void {
  const summary: WorkspaceSummary = {
    id: workspace.id ?? "org_riverside",
    name: workspace.name ?? "Riverside Computer Centre",
    role,
    institutionType: "training_institute",
  };
  authMocks.userId = storyUser.id;
  authMocks.user = storyUser;
  authMocks.workspaceId = summary.id;
  authMocks.role = role;
  authMocks.workspaces = [summary];
}

export function navigateInApp(path: string): void {
  authMocks.navigateInApp(path);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return children;
}

function useAction() {
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<AuthError | null>(null);
  const run = useCallback(
    async (call: () => Promise<AuthResult>): Promise<AuthResult> => {
      setFetchStatus("fetching");
      setError(null);
      try {
        const result = await call();
        setError(result.error);
        return result;
      } finally {
        setFetchStatus("idle");
      }
    },
    [],
  );
  const clearError = () => {
    setError(null);
  };
  return { run, fetchStatus, error, clearError };
}

export function useAuth() {
  return {
    isLoaded: true as const,
    isSignedIn: authMocks.userId != null,
    userId: authMocks.userId,
    workspaceId: authMocks.workspaceId,
    role: authMocks.role,
  };
}

export function useUser() {
  return { isSignedIn: authMocks.user != null, user: authMocks.user };
}

export function useWorkspace() {
  return {
    workspace:
      authMocks.workspaces.find(
        (workspace) => workspace.id === authMocks.workspaceId,
      ) ?? null,
  };
}

export function useWorkspaceList() {
  const { run, fetchStatus, error } = useAction();
  const setActive = useCallback(
    (workspaceId: string, redirectTo: string) =>
      run(() => authMocks.setActive(workspaceId, redirectTo)),
    [run],
  );
  return {
    isLoaded: true as const,
    workspaces: authMocks.workspaces,
    setActive,
    fetchStatus,
    error,
  };
}

export function useSignIn() {
  const { run, fetchStatus, error, clearError } = useAction();
  return {
    password: (input: { identifier: string; password: string }) =>
      run(() => authMocks.signIn.password(input)),
    google: (callbackPath: string) =>
      run(() => authMocks.signIn.google(callbackPath)),
    fetchStatus,
    error,
    clearError,
  };
}

export function useSignUp() {
  const { run, fetchStatus, error, clearError } = useAction();
  return {
    create: (input: { username: string; email: string; password: string }) =>
      run(() => authMocks.signUp.create(input)),
    sendEmailCode: (email: string) =>
      run(() => authMocks.signUp.sendEmailCode(email)),
    verifyEmailCode: (input: { email: string; code: string }) =>
      run(() => authMocks.signUp.verifyEmailCode(input)),
    fetchStatus,
    error,
    clearError,
  };
}

export function usePasswordReset() {
  const { run, fetchStatus, error, clearError } = useAction();
  return {
    sendCode: (email: string) =>
      run(() => authMocks.passwordReset.sendCode(email)),
    reset: (input: { email: string; code: string; password: string }) =>
      run(() => authMocks.passwordReset.reset(input)),
    fetchStatus,
    error,
    clearError,
  };
}

export function useAcceptInvitation() {
  const { run, fetchStatus, error } = useAction();
  const accept = useCallback(
    (invitationId: string) =>
      run(() => authMocks.acceptInvitation(invitationId)),
    [run],
  );
  return { accept, fetchStatus, error };
}

export function useSignOut() {
  const { run, fetchStatus } = useAction();
  return {
    signOut: async (redirectTo = "/login") => {
      await run(() => authMocks.signOut(redirectTo));
      authMocks.navigateInApp(redirectTo);
    },
    fetchStatus,
  };
}
