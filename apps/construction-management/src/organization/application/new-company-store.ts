import type { NewCompany } from "../domain/new-company";

/** Writes a new Company's rows in one transaction, with its audit event. */
export type NewCompanyStore = {
  create(company: NewCompany): Promise<void>;
};
