import { randomUUID } from "node:crypto";

import { prisma } from "@repo/whiteboard-db";

import { fromIsoDate } from "@/src/preschool/domain/dates";

import { addInvoice } from "../fees/testing";
import type { PreschoolFixture } from "../_lib/testing";

// Fixtures for the dashboard and royalty HTTP tests: Fee Payments with
// their allocations, written straight to the database.

let receipt = 0;

/** A Fee Payment received on `receivedOn`, allocated in full to new Invoices, one per line. */
export async function addPayment(
  fixture: PreschoolFixture,
  input: {
    childId: string;
    admissionId: string;
    centreId?: string;
    receivedOn: string;
    lines: { head: string; amountPaise: number }[];
  },
): Promise<{ paymentId: string; receiptNumber: string }> {
  const centreId = input.centreId ?? fixture.centreId;
  const paymentId = randomUUID();
  receipt += 1;
  const receiptNumber = `T/${String(receipt)}-${paymentId.slice(0, 6)}`;
  const invoiceIds: string[] = [];
  for (const line of input.lines)
    invoiceIds.push(
      await addInvoice(fixture, {
        childId: input.childId,
        admissionId: input.admissionId,
        head: line.head,
        label: line.head,
        dueOn: input.receivedOn,
        amountPaise: line.amountPaise,
        paidPaise: line.amountPaise,
        centreId,
      }),
    );
  await prisma.preschoolFeePayment.create({
    data: {
      id: paymentId,
      workspaceId: fixture.workspaceId,
      centreId,
      childId: input.childId,
      receiptNumber,
      receivedOn: fromIsoDate(input.receivedOn),
      amountPaise: input.lines.reduce((sum, line) => sum + line.amountPaise, 0),
      method: "cash",
      recordedByUserId: fixture.ownerUserId,
      recordedByName: "Owner",
      allocations: {
        create: input.lines.map((line, index) => ({
          id: randomUUID(),
          workspaceId: fixture.workspaceId,
          invoiceId: invoiceIds[index] ?? "",
          amountPaise: line.amountPaise,
        })),
      },
    },
  });
  return { paymentId, receiptNumber };
}

export function monthRequest(path: string, month?: string): Request {
  return new Request(
    `http://localhost/api/preschool${path}${month == null ? "" : `?month=${month}`}`,
  );
}
