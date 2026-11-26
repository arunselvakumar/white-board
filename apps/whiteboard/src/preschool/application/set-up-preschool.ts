import { academicYearFor } from "../domain/academic-year";
import { todayInIndia, type IsoDate } from "../domain/dates";
import {
  centreCodeFromName,
  DEFAULT_ACADEMIC_YEAR_START_MONTH,
  DEFAULT_DEVELOPMENT_DOMAINS,
  DEFAULT_FEE_HEADS,
  DEFAULT_PROGRAMMES,
} from "../domain/defaults";
import { invalid } from "../domain/errors";

export type SetUpPreschoolInput = {
  workspaceId: string;
  /** The preschool's name; the first Centre takes it. */
  name: string;
  /** 1–12. Defaults to April. */
  academicYearStartMonth?: number;
};

export type PreschoolSeed = {
  workspaceId: string;
  academicYearStartMonth: number;
  academicYear: { name: string; startsOn: IsoDate; endsOn: IsoDate };
  centre: { name: string; code: string };
  programmes: typeof DEFAULT_PROGRAMMES;
  feeHeads: typeof DEFAULT_FEE_HEADS;
  developmentDomains: typeof DEFAULT_DEVELOPMENT_DOMAINS;
};

export type SetUpPreschoolResult = {
  centreId: string;
  academicYearId: string;
  /** False when the Workspace was already set up and nothing was written. */
  created: boolean;
};

export type PreschoolSetupStore = {
  /** Writes the seed in one transaction, or returns the existing ids. */
  seed(seed: PreschoolSeed): Promise<SetUpPreschoolResult>;
};

/**
 * Turns a new Workspace into a Preschool: settings, the current Academic
 * Year, one Centre, the standard Programmes, Fee Heads and Development
 * Domains. Safe to call twice.
 */
export class SetUpPreschool {
  constructor(
    private readonly deps: { store: PreschoolSetupStore; now: () => Date },
  ) {}

  async execute(input: SetUpPreschoolInput): Promise<SetUpPreschoolResult> {
    const startMonth =
      input.academicYearStartMonth ?? DEFAULT_ACADEMIC_YEAR_START_MONTH;
    if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12)
      throw invalid(
        "ACADEMIC_YEAR_START_MONTH_INVALID",
        "The Academic Year start month must be 1 to 12.",
      );
    const name = input.name.trim();
    if (name === "")
      throw invalid("PRESCHOOL_NAME_REQUIRED", "Enter the preschool's name.");
    return this.deps.store.seed({
      workspaceId: input.workspaceId,
      academicYearStartMonth: startMonth,
      academicYear: academicYearFor(todayInIndia(this.deps.now()), startMonth),
      centre: { name, code: centreCodeFromName(name) },
      programmes: DEFAULT_PROGRAMMES,
      feeHeads: DEFAULT_FEE_HEADS,
      developmentDomains: DEFAULT_DEVELOPMENT_DOMAINS,
    });
  }
}
