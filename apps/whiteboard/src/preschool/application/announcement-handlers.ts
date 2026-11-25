import {
  announcementDates,
  announcementText,
  TEACHER_ANNOUNCEMENT_KINDS,
  type AnnouncementKind,
} from "../domain/announcement";
import { addDays, todayInIndia, type IsoDate } from "../domain/dates";
import { forbidden, invalid, notFound } from "../domain/errors";
import {
  assertCentre,
  assertManagerOf,
  isManager,
  type PreschoolActor,
} from "./access";
import type {
  AnnouncementNotifier,
  AnnouncementReach,
  AnnouncementRecord,
  AnnouncementStore,
} from "./announcement-ports";
import type {
  AnnouncementPageView,
  AnnouncementView,
  FamilyAnnouncementsView,
} from "./announcement-views";
import { decodeCursor, pageFrom } from "./list-cursor";

export type AnnouncementContentInput = {
  kind: AnnouncementKind;
  title: string;
  body: string;
  startsOn?: IsoDate | null;
  endsOn?: IsoDate | null;
};

export type CreateAnnouncementInput = AnnouncementContentInput & {
  /** Null: every Centre (the Owner only). */
  centreId: string | null;
  /** Null or left out: the whole Centre. */
  classroomId?: string | null;
};

export type ListAnnouncementsInput = {
  centreId: string;
  kind?: AnnouncementKind;
  limit?: number;
  cursor?: string;
};

export const ANNOUNCEMENT_PAGE_SIZE = 20;
/** How far ahead "Coming up" looks. */
export const UPCOMING_DAYS = 60;

function announcementNotFound() {
  return notFound("ANNOUNCEMENT_NOT_FOUND", "Announcement not found.");
}

/**
 * Whether the actor may edit or remove it: its author, a manager of its
 * Centre, and for an all-Centre Announcement the Owner.
 */
export function canEditAnnouncement(
  actor: PreschoolActor,
  announcement: Pick<AnnouncementRecord, "centreId" | "createdByUserId">,
): boolean {
  if (actor.role === "parent") return false;
  if (announcement.centreId == null) return actor.role === "owner";
  if (announcement.createdByUserId === actor.userId) return true;
  return isManager(actor) && actor.centreIds.includes(announcement.centreId);
}

/** Announcements, events and holidays for Parents, from Head Office, a Centre or a Classroom. */
export class AnnouncementHandlers {
  constructor(
    private readonly deps: {
      store: AnnouncementStore;
      notifier: AnnouncementNotifier;
      now: () => Date;
      newId?: () => string;
    },
  ) {}

  private view(
    actor: PreschoolActor,
    record: AnnouncementRecord,
  ): AnnouncementView {
    return { ...record, canEdit: canEditAnnouncement(actor, record) };
  }

  /** Staff of the Centre; a Teacher sees whole-Centre ones and their own Classrooms'. */
  private staffReach(
    actor: PreschoolActor,
    centreId: string,
  ): AnnouncementReach {
    assertCentre(actor, centreId);
    return {
      centres: [
        {
          centreId,
          classroomIds: actor.role === "teacher" ? actor.classroomIds : null,
        },
      ],
    };
  }

  private async page(
    actor: PreschoolActor,
    reach: AnnouncementReach,
    input: { kind?: AnnouncementKind; limit?: number; cursor?: string },
  ): Promise<AnnouncementPageView> {
    const limit = input.limit ?? ANNOUNCEMENT_PAGE_SIZE;
    const { rows, total } = await this.deps.store.list({
      workspaceId: actor.workspaceId,
      reach,
      kind: input.kind ?? null,
      limit,
      after: input.cursor == null ? null : decodeCursor(input.cursor),
    });
    const page = pageFrom(rows, limit, total, (row) => ({
      key: row.publishedAt,
      id: row.id,
    }));
    return { ...page, items: page.items.map((row) => this.view(actor, row)) };
  }

  private async upcomingFor(
    actor: PreschoolActor,
    reach: AnnouncementReach,
  ): Promise<AnnouncementView[]> {
    const today = todayInIndia(this.deps.now());
    const rows = await this.deps.store.upcoming({
      workspaceId: actor.workspaceId,
      reach,
      from: today,
      to: addDays(today, UPCOMING_DAYS),
    });
    return rows.map((row) => this.view(actor, row));
  }

  list(
    actor: PreschoolActor,
    input: ListAnnouncementsInput,
  ): Promise<AnnouncementPageView> {
    return this.page(actor, this.staffReach(actor, input.centreId), input);
  }

  upcoming(
    actor: PreschoolActor,
    centreId: string,
  ): Promise<AnnouncementView[]> {
    return this.upcomingFor(actor, this.staffReach(actor, centreId));
  }

  /** A Parent's: their Children's Centres and current Classrooms, and every Centre's. */
  async family(
    actor: PreschoolActor,
    input: { limit?: number; cursor?: string },
  ): Promise<FamilyAnnouncementsView> {
    if (actor.role !== "parent")
      throw forbidden("FORBIDDEN", "This is the Parents' view.");
    const reach = await this.deps.store.familyReach(
      actor.workspaceId,
      actor.childIds,
    );
    // Announcements reach active Children; a family whose Children have all
    // left gets none, not even Head Office's.
    if (reach.centres.length === 0)
      return { items: [], nextCursor: null, total: 0, upcoming: [] };
    const [page, upcoming] = await Promise.all([
      this.page(actor, reach, input),
      this.upcomingFor(actor, reach),
    ]);
    return { ...page, upcoming };
  }

  async create(
    actor: PreschoolActor,
    input: CreateAnnouncementInput,
  ): Promise<AnnouncementView> {
    const text = announcementText(input);
    const dates = announcementDates(input.kind, input.startsOn, input.endsOn);
    const classroomId = input.classroomId ?? null;
    await this.assertMayPost(actor, input.centreId, classroomId, input.kind);
    const id = (this.deps.newId ?? (() => crypto.randomUUID()))();
    await this.deps.store.insert({
      id,
      workspaceId: actor.workspaceId,
      centreId: input.centreId,
      classroomId,
      kind: input.kind,
      ...text,
      ...dates,
      createdByUserId: actor.userId,
      createdByName: actor.userName,
    });
    const record = await this.deps.store.get(actor.workspaceId, id);
    if (record == null) throw announcementNotFound();
    await this.tellParents(actor, record);
    return this.view(actor, record);
  }

  async updateDetails(
    actor: PreschoolActor,
    id: string,
    input: AnnouncementContentInput,
  ): Promise<AnnouncementView> {
    const record = await this.editable(actor, id);
    if (
      actor.role === "teacher" &&
      !TEACHER_ANNOUNCEMENT_KINDS.includes(input.kind)
    )
      throw forbidden(
        "ANNOUNCEMENT_KIND_FORBIDDEN",
        "Only the Owner or the Centre Head can announce a holiday.",
      );
    await this.deps.store.update(id, {
      kind: input.kind,
      ...announcementText(input),
      ...announcementDates(input.kind, input.startsOn, input.endsOn),
    });
    const updated = await this.deps.store.get(actor.workspaceId, record.id);
    if (updated == null) throw announcementNotFound();
    return this.view(actor, updated);
  }

  async remove(actor: PreschoolActor, id: string): Promise<void> {
    await this.editable(actor, id);
    await this.deps.store.remove(id, this.deps.now());
  }

  private async editable(
    actor: PreschoolActor,
    id: string,
  ): Promise<AnnouncementRecord> {
    const record = await this.deps.store.get(actor.workspaceId, id);
    if (record == null) throw announcementNotFound();
    if (record.centreId != null) assertCentre(actor, record.centreId);
    if (!canEditAnnouncement(actor, record))
      throw forbidden(
        "FORBIDDEN",
        "Only its author or a manager of the Centre can change it.",
      );
    return record;
  }

  /**
   * Every Centre: the Owner. A whole Centre: its managers. A Classroom: its
   * managers, or its own Teacher for a notice or an event.
   */
  private async assertMayPost(
    actor: PreschoolActor,
    centreId: string | null,
    classroomId: string | null,
    kind: AnnouncementKind,
  ): Promise<void> {
    if (centreId == null) {
      if (classroomId != null)
        throw invalid(
          "CLASSROOM_NEEDS_CENTRE",
          "A Classroom's Announcement names its Centre.",
        );
      if (actor.role !== "owner")
        throw forbidden(
          "FORBIDDEN",
          "Only the Owner can announce to every Centre.",
        );
      return;
    }
    assertCentre(actor, centreId);
    if (classroomId == null) {
      assertManagerOf(actor, centreId);
      return;
    }
    const classroom = await this.deps.store.classroom(
      actor.workspaceId,
      classroomId,
    );
    if (classroom == null)
      throw notFound("CLASSROOM_NOT_FOUND", "Classroom not found.");
    if (classroom.centreId !== centreId)
      throw invalid(
        "CLASSROOM_OTHER_CENTRE",
        "The Classroom belongs to another Centre.",
      );
    if (isManager(actor)) return;
    if (actor.role !== "teacher" || !actor.classroomIds.includes(classroomId))
      throw forbidden(
        "CLASSROOM_FORBIDDEN",
        "You can post only to your own Classrooms.",
      );
    if (!TEACHER_ANNOUNCEMENT_KINDS.includes(kind))
      throw forbidden(
        "ANNOUNCEMENT_KIND_FORBIDDEN",
        "Only the Owner or the Centre Head can announce a holiday.",
      );
  }

  /** Emails the Parents it reaches; a failure is logged and never undoes it. */
  private async tellParents(
    actor: PreschoolActor,
    record: AnnouncementRecord,
  ): Promise<void> {
    try {
      const recipientEmails = await this.deps.store.recipientEmails(
        actor.workspaceId,
        record,
      );
      if (recipientEmails.length === 0) return;
      await this.deps.notifier.published({
        workspaceId: actor.workspaceId,
        announcementId: record.id,
        title: record.title,
        kind: record.kind,
        body: record.body,
        startsOn: record.startsOn,
        recipientEmails,
      });
    } catch (error) {
      console.error(
        "Announcement email failed",
        { announcementId: record.id },
        error,
      );
    }
  }
}
