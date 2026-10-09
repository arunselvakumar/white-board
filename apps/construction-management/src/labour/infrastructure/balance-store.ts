import type { PrismaClient } from "@repo/db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import type {
  BalanceEntry,
  BalanceParty,
  BalancePaymentInfo,
  BalanceStore,
} from "../application/balance-handlers";
import type { LedgerSourceType, PartyType, Period } from "../domain/ledger";
import { companyToday } from "./prisma-labour-queries";

function byName<T extends { name: string }>(items: T[]): T[] {
  const collator = new Intl.Collator("en", {
    sensitivity: "base",
    numeric: true,
  });
  return items.sort((a, b) => collator.compare(a.name, b.name));
}

/** Plain reads of labourers, vendors, the ledger and payments for balances. */
export class PrismaBalanceStore implements BalanceStore {
  constructor(private readonly db: PrismaClient) {}

  /** Parties with an entry in this Project during the period. */
  private async partiesWithEntries(
    workspaceId: string,
    partyType: PartyType,
    projectId: string,
    range: Period,
  ): Promise<string[]> {
    const rows = await this.db.constructionLabourLedgerEntry.findMany({
      where: {
        workspaceId,
        partyType,
        projectId,
        entryDate: {
          gte: calendarDateToDb(range.from),
          lte: calendarDateToDb(range.to),
        },
      },
      distinct: ["partyId"],
      select: { partyId: true },
    });
    return rows.map((row) => row.partyId);
  }

  async parties(
    workspaceId: string,
    partyType: PartyType,
    projectId: string,
    range: Period,
  ): Promise<BalanceParty[]> {
    const withEntries = await this.partiesWithEntries(
      workspaceId,
      partyType,
      projectId,
      range,
    );
    const joinedBy = { lte: calendarDateToDb(range.to) };
    if (partyType === "labour") {
      const rows = await this.db.constructionLabourLabour.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          OR: [
            { currentProjectId: projectId, joiningDate: joinedBy },
            { id: { in: withEntries } },
          ],
        },
        select: {
          id: true,
          name: true,
          labourCode: true,
          isActive: true,
          currentProjectId: true,
        },
      });
      return byName(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          code: row.labourCode,
          isActive: row.isActive,
          onProject: row.currentProjectId === projectId,
        })),
      );
    }
    const rows = await this.db.constructionLabourVendor.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [
          { projects: { some: { projectId } }, joiningDate: joinedBy },
          { id: { in: withEntries } },
        ],
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        projects: { where: { projectId }, select: { projectId: true } },
      },
    });
    return byName(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: null,
        isActive: row.isActive,
        onProject: row.projects.length > 0,
      })),
    );
  }

  async party(
    workspaceId: string,
    partyType: PartyType,
    partyId: string,
    projectId: string,
  ): Promise<BalanceParty | null> {
    const where = { id: partyId, workspaceId, deletedAt: null };
    if (partyType === "labour") {
      const row = await this.db.constructionLabourLabour.findFirst({
        where,
        select: {
          id: true,
          name: true,
          labourCode: true,
          isActive: true,
          currentProjectId: true,
        },
      });
      return row == null
        ? null
        : {
            id: row.id,
            name: row.name,
            code: row.labourCode,
            isActive: row.isActive,
            onProject: row.currentProjectId === projectId,
          };
    }
    const row = await this.db.constructionLabourVendor.findFirst({
      where,
      select: {
        id: true,
        name: true,
        isActive: true,
        projects: { where: { projectId }, select: { projectId: true } },
      },
    });
    return row == null
      ? null
      : {
          id: row.id,
          name: row.name,
          code: null,
          isActive: row.isActive,
          onProject: row.projects.length > 0,
        };
  }

  async hasEntriesIn(
    workspaceId: string,
    partyType: PartyType,
    partyId: string,
    projectId: string,
  ): Promise<boolean> {
    const row = await this.db.constructionLabourLedgerEntry.findFirst({
      where: { workspaceId, partyType, partyId, projectId },
      select: { id: true },
    });
    return row != null;
  }

  async entries(
    workspaceId: string,
    partyType: PartyType,
    partyIds: readonly string[],
    to: CalendarDate,
  ): Promise<BalanceEntry[]> {
    if (partyIds.length === 0) return [];
    const rows = await this.db.constructionLabourLedgerEntry.findMany({
      where: {
        workspaceId,
        partyType,
        partyId: { in: [...new Set(partyIds)] },
        entryDate: { lte: calendarDateToDb(to) },
      },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      partyId: row.partyId,
      kind: row.kind,
      amount: row.amount,
      entryDate: calendarDateFromDb(row.entryDate),
      projectId: row.projectId,
      sourceType: row.sourceType as LedgerSourceType,
      sourceId: row.sourceId,
      reversesEntryId: row.reversesEntryId,
    }));
  }

  async payments(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, BalancePaymentInfo>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionLabourWagePayment.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        mode: true,
        reference: true,
        remarks: true,
        deletedAt: true,
        updatedAt: true,
        documentKey: true,
      },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          mode: row.mode,
          reference: row.reference,
          remarks: row.remarks,
          cancelled: row.deletedAt != null,
          updatedAt: row.updatedAt,
          hasReceipt: row.documentKey != null,
        },
      ]),
    );
  }

  today(workspaceId: string): Promise<CalendarDate> {
    return companyToday(this.db, workspaceId);
  }
}
