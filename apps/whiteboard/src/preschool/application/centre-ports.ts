import type {
  CentreDetails,
  CentreOwnership,
  CentreStatus,
  FranchiseTerms,
} from "../domain/centre";
import type { IsoDate } from "../domain/dates";

/** A Centre row as the store reads it. Calendar dates are YYYY-MM-DD. */
export type CentreRecord = CentreDetails & {
  id: string;
  workspaceId: string;
  ownership: CentreOwnership;
  status: CentreStatus;
  franchiseeName: string | null;
  franchiseePhone: string | null;
  franchiseeEmail: string | null;
  agreementStartOn: IsoDate | null;
  agreementEndOn: IsoDate | null;
  /** 0–10000. */
  royaltyBps: number;
  mayOverrideFees: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CentreCounts = {
  /** Children whose status is active. */
  activeChildren: number;
  /** Classrooms of the current Academic Year that are not archived. */
  classrooms: number;
};

export type CentreStore = {
  /** These Centres of the Workspace, by name, with their counts. */
  list(
    workspaceId: string,
    centreIds: readonly string[],
  ): Promise<(CentreRecord & CentreCounts)[]>;
  find(workspaceId: string, id: string): Promise<CentreRecord | null>;
  counts(workspaceId: string, id: string): Promise<CentreCounts>;
  /** 409 `CENTRE_CODE_IN_USE` when another Centre of the Workspace has the code. */
  create(
    record: CentreDetails &
      FranchiseTerms & { id: string; workspaceId: string },
  ): Promise<void>;
  /** 409 `CENTRE_CODE_IN_USE` when another Centre of the Workspace has the code. */
  updateDetails(
    workspaceId: string,
    id: string,
    details: CentreDetails,
  ): Promise<void>;
  updateFranchise(
    workspaceId: string,
    id: string,
    terms: FranchiseTerms,
  ): Promise<void>;
  setStatus(
    workspaceId: string,
    id: string,
    status: CentreStatus,
  ): Promise<void>;
};
