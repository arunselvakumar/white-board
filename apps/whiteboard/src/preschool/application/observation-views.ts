import type { IsoDate } from "../domain/dates";
import type { ListPage } from "./list-cursor";

// JSON-ready. Dates are YYYY-MM-DD; instants are ISO strings.

export type DevelopmentDomainView = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  archived: boolean;
};

export type ObservationView = {
  id: string;
  childId: string;
  childName: string;
  domainId: string;
  domainName: string;
  observedOn: IsoDate;
  note: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  /** The actor may edit and remove it: its author or a manager of the Centre. */
  canEdit: boolean;
};

export type ObservationPageView = ListPage<ObservationView>;
