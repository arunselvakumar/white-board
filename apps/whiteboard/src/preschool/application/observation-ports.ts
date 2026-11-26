import type { IsoDate } from "../domain/dates";
import type { RosterReader } from "./attendance-ports";
import type { ListCursor } from "./list-cursor";
import type {
  DevelopmentDomainView,
  ObservationView,
} from "./observation-views";

export type ObservationRecord = Omit<ObservationView, "canEdit"> & {
  centreId: string;
};

export type ObservationStore = RosterReader & {
  /** By sort order; archived ones only when asked. */
  domains(
    workspaceId: string,
    includeArchived: boolean,
  ): Promise<DevelopmentDomainView[]>;
  domain(
    workspaceId: string,
    id: string,
  ): Promise<DevelopmentDomainView | null>;
  /** Another Domain in use has this name, ignoring case. */
  domainNameTaken(
    workspaceId: string,
    name: string,
    exceptId: string | null,
  ): Promise<boolean>;
  insertDomain(input: {
    id: string;
    workspaceId: string;
    name: string;
    description: string | null;
  }): Promise<void>;
  updateDomain(
    id: string,
    change: { name: string; description: string | null },
  ): Promise<void>;
  setDomainArchived(id: string, archivedAt: Date | null): Promise<void>;
  insertObservation(input: {
    id: string;
    workspaceId: string;
    centreId: string;
    childId: string;
    domainId: string;
    observedOn: IsoDate;
    note: string;
    createdByUserId: string;
    createdByName: string;
  }): Promise<void>;
  observation(
    workspaceId: string,
    id: string,
  ): Promise<ObservationRecord | null>;
  updateObservation(
    id: string,
    change: { domainId: string; observedOn: IsoDate; note: string },
  ): Promise<void>;
  removeObservation(id: string, at: Date): Promise<void>;
  /** Newest observed first, `limit + 1` rows. */
  observations(params: {
    workspaceId: string;
    childIds: readonly string[];
    domainId: string | null;
    from: IsoDate | null;
    to: IsoDate | null;
    limit: number;
    after: ListCursor | null;
  }): Promise<{ rows: ObservationRecord[]; total: number }>;
};
