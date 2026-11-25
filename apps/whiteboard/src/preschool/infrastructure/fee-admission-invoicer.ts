import type { PrismaClient } from "@repo/whiteboard-db";

import { PrismaFeeInvoiceGenerator } from "./prisma-fee-invoice-generator";

export type AdmissionInvoicer = {
  /**
   * Raises the new Admission's Invoices from the Fee Structure in force. Does
   * nothing when it already has Invoices or there is no structure.
   */
  onAdmitted(input: {
    admissionId: string;
    childId: string;
    centreId: string;
    programmeId: string;
    academicYearId: string;
    /** YYYY-MM-DD */
    admittedOn: string;
  }): Promise<void>;
};

/**
 * The fee side of an Admission. It reads the Admission row itself, so call
 * it after the Admission is committed.
 */
export function createAdmissionInvoicer(deps?: {
  prisma?: PrismaClient;
}): AdmissionInvoicer {
  const generator = new PrismaFeeInvoiceGenerator(deps?.prisma);
  return {
    async onAdmitted(input) {
      await generator.generate(input.admissionId);
    },
  };
}
