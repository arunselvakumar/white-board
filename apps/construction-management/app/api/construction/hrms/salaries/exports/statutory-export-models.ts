import { z } from "zod";

/**
 * PF and ESI export models (CM-320), menu `hrms.salaries` export and
 * financial. The files are built from an approved month's slips.
 */

const month = z.string().describe("`YYYY-MM`: an approved salary month.");

export const GetConstructionHrmsPfReturnQueryModel = z.object({
  month,
  format: z
    .enum(["txt", "xlsx"])
    .default("txt")
    .describe(
      "`txt`: the EPFO ECR upload (`#~#` separated, one line per member with a UAN). `xlsx`: the same columns with totals and a Missing UAN sheet.",
    ),
});

export const GetConstructionHrmsEsiReturnQueryModel = z.object({
  month,
});
