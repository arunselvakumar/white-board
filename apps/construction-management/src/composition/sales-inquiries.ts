import { prisma } from "@repo/construction-db";

import { InquiryActivityHandlers } from "@/src/sales/application/inquiry-activity-handlers";
import { InquiryHandlers } from "@/src/sales/application/inquiry-handlers";
import {
  PrismaFollowUpStore,
  PrismaInquiryTaskStore,
} from "@/src/sales/infrastructure/inquiry-activity-store";
import { PrismaInquiryStore } from "@/src/sales/infrastructure/inquiry-store";
import {
  companyTimezone,
  companyToday,
} from "@/src/shared-kernel/company-today";
import { loadBackdatedCheck } from "@/src/site-work/infrastructure/site-work-guards";

import { messagingEvents } from "./messaging";
import { bookUnitInTx } from "./sales-bookings";
import { salesDirectory } from "./sales-directory";
import { salesListStore } from "./sales-settings";

/** The inquiries' store (CM-1003), shared with follow-ups and tasks. */
export const inquiryStore = new PrismaInquiryStore();

/**
 * Inquiry handlers (CM-1003) wired to Prisma, the SalesDirectory, the
 * Back-dated Entry policy, the Company's clock and messaging
 * (`InquiryAssigned` → `inquiry.assigned`).
 */
export function createInquiryHandlers(): InquiryHandlers {
  return new InquiryHandlers({
    db: prisma,
    store: inquiryStore,
    lists: salesListStore,
    directory: salesDirectory,
    backdated: (access) => loadBackdatedCheck(prisma, access),
    today: (workspaceId) => companyToday(prisma, workspaceId),
    timeZone: (workspaceId) => companyTimezone(prisma, workspaceId),
    events: messagingEvents(),
    // Converting books the unit through the bookings' own rules (CM-1007).
    bookings: { bookUnit: (tx, input) => bookUnitInTx(tx, input) },
  });
}

/** One set of handlers for every inquiry route. */
export const inquiryHandlers = createInquiryHandlers();

/**
 * Follow-ups and Inquiry Tasks (CM-1004), on the same inquiry handlers so
 * View all is checked one way.
 */
export const inquiryActivityHandlers = new InquiryActivityHandlers({
  db: prisma,
  inquiries: inquiryHandlers,
  inquiryStore,
  followUps: new PrismaFollowUpStore(),
  tasks: new PrismaInquiryTaskStore(),
  lists: salesListStore,
  directory: salesDirectory,
  backdated: (access) => loadBackdatedCheck(prisma, access),
  timeZone: (workspaceId) => companyTimezone(prisma, workspaceId),
});
