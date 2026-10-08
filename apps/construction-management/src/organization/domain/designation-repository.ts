import type { Designation } from "./designation";

export type DesignationRepository = {
  save(designation: Designation): Promise<void>;
  findById(workspaceId: string, id: string): Promise<Designation | null>;
  /** Live Designations, by name. */
  listAll(workspaceId: string): Promise<Designation[]>;
};
