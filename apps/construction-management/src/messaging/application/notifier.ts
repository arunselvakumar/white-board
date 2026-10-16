import { normalizeDraft, type NotificationDraft } from "../domain/notification";
import type { NotificationStore } from "./ports";

export type NotifierDeps = {
  store: NotificationStore;
  /**
   * Starts the new push jobs without holding the command (after the
   * response, ADR CM-0021 §1). Optional: the daily drain sends them too.
   */
  kick?: (pushJobIds: readonly string[]) => Promise<void>;
  clock?: () => Date;
};

/**
 * Writes one notification per recipient in one insert, with one `push`
 * job each (ADR CM-0021 §6). A recipient listed twice gets one row; a
 * listener that runs twice for one event adds nothing (`sourceKey`).
 */
export class Notifier {
  constructor(private readonly deps: NotifierDeps) {}

  async notify(
    workspaceId: string,
    recipients: readonly string[],
    draft: NotificationDraft,
  ): Promise<string[]> {
    const unique = [...new Set(recipients)];
    if (unique.length === 0) return [];
    const normalized = normalizeDraft(draft);
    const now = (this.deps.clock ?? (() => new Date()))();
    const { notificationIds, pushJobIds } = await this.deps.store.insert(
      unique.map((recipientUserId) => ({
        ...normalized,
        workspaceId,
        recipientUserId,
      })),
      now,
    );
    if (pushJobIds.length > 0 && this.deps.kick != null)
      await this.deps.kick(pushJobIds);
    return notificationIds;
  }
}
