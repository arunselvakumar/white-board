import { localNow } from "../domain/class-schedule";
import {
  FeeFollowUp,
  noDuesToFollowUp,
  type FeeFollowUpAction,
  type FeeFollowUpDetails,
} from "../domain/fee-follow-up";
import type { EnrollmentDuesFacts, FeeFollowUpStore } from "./fee-dues-ports";
import type { FeeDuesQueries } from "./fee-dues-queries";
import type { FeeDuesActor, FeeFollowUpView } from "./fee-dues-views";
import {
  EnrollmentNotFoundError,
  FeeFollowUpNotFoundError,
} from "./not-found-error";

/** Log, edit, and close Fee Follow-ups. Owner-only (ADR-0039). */
export class FeeFollowUpHandlers {
  constructor(
    private readonly deps: {
      store: FeeFollowUpStore;
      queries: FeeDuesQueries;
      now: () => Date;
      newId: () => string;
    },
  ) {}

  /** Logs a Fee Follow-up and closes the Enrollment's open one, if any. */
  async log(
    actor: FeeDuesActor,
    enrollmentId: string,
    details: FeeFollowUpDetails,
  ): Promise<FeeFollowUpView> {
    const saved = await this.deps.store.transaction(async (store) => {
      const facts = await store.lockEnrollment(actor.workspaceId, enrollmentId);
      if (facts == null) throw new EnrollmentNotFoundError();
      if (facts.netAmountPaise - facts.paidPaise <= 0) throw noDuesToFollowUp();
      const action = this.action(actor, facts);
      const followUp = FeeFollowUp.log(
        {
          id: this.deps.newId(),
          workspaceId: actor.workspaceId,
          enrollmentId,
          details,
        },
        action,
      );
      const previous = await store.openFollowUp(
        actor.workspaceId,
        enrollmentId,
      );
      if (previous != null) {
        previous.supersede(action);
        await store.save(previous);
      }
      await store.save(followUp);
      return followUp;
    });
    return this.view(saved);
  }

  /** Changes the channel, note, and next date of the open Fee Follow-up. */
  async edit(
    actor: FeeDuesActor,
    id: string,
    details: FeeFollowUpDetails,
  ): Promise<FeeFollowUpView> {
    return this.change(actor, id, (followUp, action) => {
      followUp.edit(details, action);
    });
  }

  /** Closes the open Fee Follow-up without logging another. */
  async markDone(actor: FeeDuesActor, id: string): Promise<FeeFollowUpView> {
    return this.change(actor, id, (followUp, action) => {
      followUp.markDone(action);
    });
  }

  private async change(
    actor: FeeDuesActor,
    id: string,
    work: (followUp: FeeFollowUp, action: FeeFollowUpAction) => void,
  ): Promise<FeeFollowUpView> {
    const saved = await this.deps.store.transaction(async (store) => {
      const found = await store.findFollowUp(actor.workspaceId, id);
      if (found == null) throw new FeeFollowUpNotFoundError();
      // Lock order matches log and Fee Payments: Enrollment first, then re-read.
      const facts = await store.lockEnrollment(
        actor.workspaceId,
        found.enrollmentId,
      );
      const followUp = await store.findFollowUp(actor.workspaceId, id);
      if (facts == null || followUp == null)
        throw new FeeFollowUpNotFoundError();
      work(followUp, this.action(actor, facts));
      await store.save(followUp);
      return followUp;
    });
    return this.view(saved);
  }

  private action(
    actor: FeeDuesActor,
    facts: EnrollmentDuesFacts,
  ): FeeFollowUpAction {
    const now = this.deps.now();
    return {
      userId: actor.userId,
      now,
      today: localNow(now, facts.timezone).date,
    };
  }

  private view(followUp: FeeFollowUp): Promise<FeeFollowUpView> {
    return this.deps.queries.view(followUp.toProps());
  }
}
