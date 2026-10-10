import type { MonthKey } from "../domain/calendar";
import {
  ptFor,
  rateInForce,
  type EsiRate,
  type PfRate,
  type PtCharge,
  type PtGender,
  type PtSlab,
} from "../domain/statutory";
import type { StatutoryRates } from "./ports";

/**
 * `StatutoryRates` over rows held in memory (ADR CM-0008): for domain and
 * application tests, which pass the seed rows or rows of their own. Same
 * rules as the database version.
 */
export class InMemoryStatutoryRates implements StatutoryRates {
  constructor(
    private readonly rows: {
      pf: readonly PfRate[];
      esi: readonly EsiRate[];
      pt: readonly PtSlab[];
    },
  ) {}

  pfFor(month: MonthKey): Promise<PfRate | null> {
    return Promise.resolve(rateInForce(this.rows.pf, month));
  }

  esiFor(month: MonthKey): Promise<EsiRate | null> {
    return Promise.resolve(rateInForce(this.rows.esi, month));
  }

  ptFor(
    stateCode: string,
    month: MonthKey,
    gross: number,
    gender?: PtGender,
  ): Promise<PtCharge> {
    return Promise.resolve(
      ptFor(this.rows.pt, { stateCode, month, gross, gender }),
    );
  }
}
