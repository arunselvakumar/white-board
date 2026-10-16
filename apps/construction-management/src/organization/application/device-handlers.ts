import { conflict, notFound } from "@/src/shared-kernel/domain-error";

import { parseUserAgent, type DeviceLabel } from "../domain/user-agent";

/** A signed-in session as `@repo/auth` keeps it. */
export type SignedInSession = {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** The User's sessions in `@repo/auth` (ADR CM-0021 §9). */
export type SessionDirectory = {
  list(userId: string): Promise<SignedInSession[]>;
  /** Ends these sessions; returns the ids that were live. */
  revoke(userId: string, sessionIds: readonly string[]): Promise<string[]>;
  /** Ends every session but `keepSessionId`; returns their ids. */
  revokeOthers(userId: string, keepSessionId: string): Promise<string[]>;
};

/**
 * Web push subscriptions by session, owned by messaging (CM-904) and
 * reached through the composition root.
 */
export type PushSessions = {
  /** The sessions among `sessionIds` with push turned on. */
  withPush(sessionIds: readonly string[]): Promise<Set<string>>;
  /** Deletes the push subscriptions of these sessions. */
  forget(sessionIds: readonly string[]): Promise<void>;
};

export type DeviceView = DeviceLabel & {
  id: string;
  signedInAt: Date;
  lastActiveAt: Date;
  isCurrent: boolean;
  pushOn: boolean;
};

/**
 * My Profile → Devices (CM-907): the User's signed-in sessions, signing
 * one out, and signing out of all the others. Signing a session out also
 * deletes its push subscriptions, so it stops getting notifications.
 */
export class DeviceHandlers {
  constructor(
    private readonly sessions: SessionDirectory,
    private readonly push: PushSessions,
  ) {}

  /** This device first, then by last activity. */
  async list(userId: string, currentSessionId: string): Promise<DeviceView[]> {
    const sessions = await this.sessions.list(userId);
    const pushOn = await this.push.withPush(sessions.map((item) => item.id));
    const views = sessions.map((session) => ({
      id: session.id,
      ...parseUserAgent(session.userAgent),
      signedInAt: session.createdAt,
      lastActiveAt: session.updatedAt,
      isCurrent: session.id === currentSessionId,
      pushOn: pushOn.has(session.id),
    }));
    return [
      ...views.filter((view) => view.isCurrent),
      ...views.filter((view) => !view.isCurrent),
    ];
  }

  /**
   * Signs one other device out. 404 `DEVICE_NOT_FOUND` when it is not a
   * live session of the User; 409 `DEVICE_IS_THIS_ONE` for this device
   * (use Sign out in the account menu).
   */
  async signOut(input: {
    userId: string;
    sessionId: string;
    currentSessionId: string;
  }): Promise<void> {
    if (input.sessionId === input.currentSessionId)
      throw conflict(
        "DEVICE_IS_THIS_ONE",
        "This is the device you are using. Use Sign out in the account menu.",
      );
    const revoked = await this.sessions.revoke(input.userId, [input.sessionId]);
    if (revoked.length === 0)
      throw notFound("DEVICE_NOT_FOUND", "This device is already signed out.");
    await this.push.forget(revoked);
  }

  /** Signs every other device out; returns how many. */
  async signOutOthers(input: {
    userId: string;
    currentSessionId: string;
  }): Promise<number> {
    const revoked = await this.sessions.revokeOthers(
      input.userId,
      input.currentSessionId,
    );
    await this.push.forget(revoked);
    return revoked.length;
  }
}
