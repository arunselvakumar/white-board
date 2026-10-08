import { z } from "zod";

/** Fields a Company is created with (CM-104/105); validation lives in the domain. */
export const companyWriteFields = {
  name: z.string().trim().min(1).max(120),
  mobile: z.string().trim().max(20).nullish(),
  email: z.string().trim().max(254).nullish(),
  country: z.string().length(2),
  currency: z.string().length(3).nullish(),
  gstin: z.string().trim().max(15).nullish(),
  pan: z.string().trim().max(10).nullish(),
  address: z.string().trim().max(500).nullish(),
};
