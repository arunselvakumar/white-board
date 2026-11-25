import { randomUUID } from "node:crypto";

import { prisma } from "@repo/whiteboard-db";
import { vi } from "vitest";

import { fromIsoDate } from "@/src/preschool/domain/dates";
import type { FeeFrequency } from "@/src/preschool/domain/fees";

import { FIXTURE_NOW, type PreschoolFixture } from "../_lib/testing";

// Fixtures for the fees HTTP tests, beside the shared ones in `_lib/testing`.

/** Freezes `Date` (only) at FIXTURE_NOW: today is 2026-11-25 in India. */
export function freezeToday(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
}

export function unfreezeToday(): void {
  vi.useRealTimers();
}

export function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/preschool/fees", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getRequest(path: string, query: Record<string, string> = {}) {
  const search = new URLSearchParams(query).toString();
  return new Request(
    `http://localhost/api/preschool/fees${path}${search === "" ? "" : `?${search}`}`,
  );
}

export function emptyRequest(): Request {
  return new Request("http://localhost", { method: "POST" });
}

export function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

export function childContext(childId: string) {
  return { params: Promise.resolve({ childId }) };
}

export async function codeOf(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

export function feeHeadId(fixture: PreschoolFixture, name: string): string {
  const id = fixture.feeHeadIds[name];
  if (id == null) throw new Error(`No Fee Head called ${name}`);
  return id;
}

export function programmeId(fixture: PreschoolFixture, name: string): string {
  const id = fixture.programmeIds[name];
  if (id == null) throw new Error(`No Programme called ${name}`);
  return id;
}

/** A Fee Structure written straight to the database. Returns its id. */
export async function setStructure(
  fixture: PreschoolFixture,
  input: {
    programme: string;
    centreId?: string | null;
    lines: { head: string; amountPaise: number; frequency: FeeFrequency }[];
  },
): Promise<string> {
  const id = randomUUID();
  await prisma.preschoolFeeStructure.create({
    data: {
      id,
      workspaceId: fixture.workspaceId,
      academicYearId: fixture.academicYearId,
      programmeId: programmeId(fixture, input.programme),
      centreId: input.centreId ?? null,
      items: {
        create: input.lines.map((line) => ({
          id: randomUUID(),
          workspaceId: fixture.workspaceId,
          feeHeadId: feeHeadId(fixture, line.head),
          amountPaise: line.amountPaise,
          frequency: line.frequency,
        })),
      },
    },
  });
  return id;
}

/** An Invoice written straight to the database. Returns its id. */
export async function addInvoice(
  fixture: PreschoolFixture,
  input: {
    childId: string;
    admissionId: string;
    head?: string;
    label?: string;
    dueOn: string;
    amountPaise: number;
    paidPaise?: number;
    centreId?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await prisma.preschoolInvoice.create({
    data: {
      id,
      workspaceId: fixture.workspaceId,
      centreId: input.centreId ?? fixture.centreId,
      childId: input.childId,
      admissionId: input.admissionId,
      feeHeadId: feeHeadId(fixture, input.head ?? "Tuition"),
      label: input.label ?? "Tuition",
      dueOn: fromIsoDate(input.dueOn),
      amountPaise: input.amountPaise,
      paidPaise: input.paidPaise ?? 0,
    },
  });
  return id;
}
