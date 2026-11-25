import type { AnnouncementKind } from "../domain/announcement";
import type { IsoDate } from "../domain/dates";
import type { ListCursor } from "./list-cursor";
import type { AnnouncementView } from "./announcement-views";

/** Emails an Announcement to the Parents it reaches. */
export type AnnouncementNotifier = {
  published(input: {
    workspaceId: string;
    announcementId: string;
    title: string;
    kind: AnnouncementKind;
    body: string;
    startsOn: IsoDate | null;
    /** Lower case, without repeats. */
    recipientEmails: string[];
  }): Promise<void>;
};

/** An Announcement as stored, before the actor-dependent `canEdit`. */
export type AnnouncementRecord = Omit<AnnouncementView, "canEdit">;

/**
 * Which Announcements a reader sees: every Centre's, plus each Centre's own
 * whole-Centre ones and those of the listed Classrooms (null: every
 * Classroom of the Centre).
 */
export type AnnouncementReach = {
  centres: { centreId: string; classroomIds: readonly string[] | null }[];
};

export type AnnouncementStore = {
  classroom(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; centreId: string } | null>;
  insert(input: {
    id: string;
    workspaceId: string;
    centreId: string | null;
    classroomId: string | null;
    kind: AnnouncementKind;
    title: string;
    body: string;
    startsOn: IsoDate | null;
    endsOn: IsoDate | null;
    createdByUserId: string;
    createdByName: string;
  }): Promise<void>;
  update(
    id: string,
    change: {
      kind: AnnouncementKind;
      title: string;
      body: string;
      startsOn: IsoDate | null;
      endsOn: IsoDate | null;
    },
  ): Promise<void>;
  remove(id: string, at: Date): Promise<void>;
  get(workspaceId: string, id: string): Promise<AnnouncementRecord | null>;
  /** Newest first, `limit + 1` rows. */
  list(params: {
    workspaceId: string;
    reach: AnnouncementReach;
    kind: AnnouncementKind | null;
    limit: number;
    after: ListCursor | null;
  }): Promise<{ rows: AnnouncementRecord[]; total: number }>;
  /** Events and holidays starting in [from, to], soonest first. */
  upcoming(params: {
    workspaceId: string;
    reach: AnnouncementReach;
    from: IsoDate;
    to: IsoDate;
  }): Promise<AnnouncementRecord[]>;
  /** The Classrooms a Parent's Children are in now, by Centre. */
  familyReach(
    workspaceId: string,
    childIds: readonly string[],
  ): Promise<AnnouncementReach>;
  /** Parent emails of active Children the audience reaches. */
  recipientEmails(
    workspaceId: string,
    audience: { centreId: string | null; classroomId: string | null },
  ): Promise<string[]>;
};
