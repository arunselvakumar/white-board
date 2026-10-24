/**
 * Sign-in accounts in `@repo/auth` that an admin makes or resets for a Team
 * Member (ADR CM-0030 §3, §6, §7). Never touches the password of a User
 * who already had an account before the admin acted.
 */
export type SignInAccounts = {
  /**
   * Makes a User with this password, to be changed at first sign-in, unless
   * a User already has this email or mobile: then `created` is false and
   * nothing changes.
   */
  createPasswordAccount(input: {
    name: string;
    email: string | null;
    phoneNumber: string | null;
    password: string;
  }): Promise<{ created: boolean; userId: string }>;
  /**
   * A new password for the User, to be changed at their next sign-in; ends
   * every session they have.
   */
  setTemporaryPassword(userId: string, password: string): Promise<void>;
  /** The Users among `userIds` who also belong to another Company. */
  inOtherCompanies(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Set<string>>;
};
