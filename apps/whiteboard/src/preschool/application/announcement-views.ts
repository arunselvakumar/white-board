import type { AnnouncementKind } from "../domain/announcement";
import type { IsoDate } from "../domain/dates";
import type { ListPage } from "./list-cursor";

// JSON-ready. Dates are YYYY-MM-DD; instants are ISO strings.

export type AnnouncementView = {
  id: string;
  /** Null: every Centre (Head Office). */
  centreId: string | null;
  /** Null: the whole Centre. */
  classroomId: string | null;
  /** "All Centres", the Centre's name, or the Classroom's name. */
  audience: string;
  kind: AnnouncementKind;
  title: string;
  /** As written; line breaks are kept. */
  body: string;
  /** First and last day of an event or holiday; null for a notice. */
  startsOn: IsoDate | null;
  endsOn: IsoDate | null;
  publishedAt: string;
  createdByUserId: string;
  createdByName: string;
  updatedAt: string;
  /** The actor may edit and remove it. */
  canEdit: boolean;
};

export type AnnouncementPageView = ListPage<AnnouncementView>;

/** What reaches a Parent's Children, and the events and holidays coming up. */
export type FamilyAnnouncementsView = AnnouncementPageView & {
  upcoming: AnnouncementView[];
};
