import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import {
  mockSalesDocumentApi,
  salesFile,
} from "@/components/sales/documents/sales-document-fixtures";
import { unitsHandler } from "@/components/sales/units/units-fixtures";
import type { SalesAccess } from "@/src/queries/sales-access";
import type {
  Booking,
  BookingDetail,
  BookingFormOptions,
  BookingPage,
} from "@/src/queries/sales-bookings";
import type { SalesDocumentFile } from "@/src/queries/sales-documents";
import type { Flag } from "@/src/shared-kernel/access";

/** Story fixtures for Bookings (CM-1006). */

export const BOOKINGS_API = "/api/construction/sales/bookings";
export const PROJECT_ID = "0199c4a0-0000-7000-8000-00000000a001";
export const WING_ID = "0199c4a0-0000-7000-8000-00000000a101";
export const UNIT_101 = "0199c4a0-0000-7000-8000-00000000c101";
export const UNIT_102 = "0199c4a0-0000-7000-8000-00000000c102";
export const HOLD_ID = "0199c4a0-0000-7000-8000-00000000d001";
export const BOOKED_ID = "0199c4a0-0000-7000-8000-00000000d002";
export const EXPIRED_ID = "0199c4a0-0000-7000-8000-00000000d003";
export const CANCELLED_ID = "0199c4a0-0000-7000-8000-00000000d004";
export const NEW_ID = "0199c4a0-0000-7000-8000-00000000d009";

const OWNER = { userId: "user-owner", name: "Arun Selva Kumar" };

const ALL: Flag[] = [
  "create",
  "read",
  "update",
  "delete",
  "notification",
  "report",
];

export function bookingAccess(flags: Flag[] = ALL): SalesAccess {
  return {
    projectId: PROJECT_ID,
    structure: "wings",
    menus: { "sales.inquiries": [], "sales.bookings": flags },
  };
}

function actions(status: Booking["storedStatus"], flags: Flag[]) {
  const update = flags.includes("update");
  return {
    edit: update && status !== "cancelled",
    confirm: update && status === "on_hold",
    extendHold: update && status === "on_hold",
    cancel: update && status !== "cancelled",
    delete: flags.includes("delete"),
    files: update,
  };
}

export function booking(
  patch: Partial<BookingDetail> = {},
  flags: Flag[] = ALL,
): BookingDetail {
  const storedStatus = patch.storedStatus ?? "on_hold";
  return {
    id: HOLD_ID,
    projectId: PROJECT_ID,
    unit: { id: UNIT_101, name: "101", floorName: "Floor 1", deleted: false },
    wing: { id: WING_ID, name: "Tower A" },
    unitType: "2BHK",
    carpetArea: "850",
    areaUnit: "sq_ft",
    status: storedStatus,
    storedStatus,
    bookingDate: "2026-10-12",
    holdUntil: storedStatus === "on_hold" ? "2026-10-24" : null,
    confirmedOn: storedStatus === "booked" ? "2026-10-12" : null,
    cancelledOn: null,
    cancelReason: null,
    customerName: "Meena Raghavan",
    customerMobile: "+919876543210",
    customerEmail: "meena@example.com",
    customerAddress: "12, Gandhi Road, Coimbatore",
    referredByName: "Suresh",
    referredByContact: "+919876543211",
    remarks: "Wants a corner unit",
    inquiry: null,
    createdBy: OWNER,
    createdAt: "2026-10-12T05:00:00.000Z",
    updatedAt: "2026-10-12T05:00:00.000Z",
    history: [
      {
        id: "0199c4a0-0000-7000-8000-00000000e001",
        kind: "created",
        status: "on_hold",
        onDate: "2026-10-12",
        holdUntil: "2026-10-24",
        reason: null,
        by: OWNER,
        at: "2026-10-12T05:00:00.000Z",
      },
    ],
    ...patch,
    actions: patch.actions ?? actions(storedStatus, flags),
  };
}

export function bookingList(flags: Flag[] = ALL): BookingDetail[] {
  return [
    booking({}, flags),
    booking(
      {
        id: BOOKED_ID,
        storedStatus: "booked",
        status: "booked",
        unit: {
          id: UNIT_102,
          name: "102",
          floorName: "Floor 1",
          deleted: false,
        },
        customerName: "Ravi Kumar",
        referredByName: null,
        inquiry: {
          id: "0199c4a0-0000-7000-8000-00000000f001",
          name: "Ravi Kumar",
        },
      },
      flags,
    ),
    booking(
      {
        id: EXPIRED_ID,
        status: "hold_expired",
        holdUntil: "2026-10-10",
        unit: {
          id: "0199c4a0-0000-7000-8000-00000000c201",
          name: "201",
          floorName: "Floor 2",
          deleted: false,
        },
        customerName: "Kavya S",
      },
      flags,
    ),
    booking(
      {
        id: CANCELLED_ID,
        storedStatus: "cancelled",
        status: "cancelled",
        cancelledOn: "2026-10-01",
        cancelReason: "Loan refused",
        unit: {
          id: "0199c4a0-0000-7000-8000-00000000c202",
          name: "202",
          floorName: "Floor 2",
          deleted: false,
        },
        customerName: "Suresh P",
      },
      flags,
    ),
  ];
}

export const FORM_OPTIONS: BookingFormOptions = {
  wings: [
    {
      id: WING_ID,
      name: "Tower A",
      units: [
        { id: UNIT_101, name: "101", floorName: "Floor 1" },
        {
          id: "0199c4a0-0000-7000-8000-00000000c301",
          name: "301",
          floorName: "Floor 3",
        },
      ],
    },
  ],
};

/** A saved file of the hold (the generic sales files' answer). */
export function bookingFile(
  role: "booking_form" | "photo",
  patch: Partial<SalesDocumentFile> = {},
): SalesDocumentFile {
  return salesFile(
    role === "booking_form" ? "booking-form.pdf" : "site.jpg",
    role,
    { thumbUrl: null, ...patch },
    { type: "booking", id: HOLD_ID },
  );
}

export type BookingApiOptions = {
  flags?: Flag[];
  /** No bookings at all. */
  empty?: boolean;
  /** Refuse the create, update and actions with this error. */
  refuse?: { status: number; code: string; message: string; details?: unknown };
  files?: SalesDocumentFile[];
};

export function bookingHandler(options: BookingApiOptions = {}) {
  const flags = options.flags ?? ALL;
  const bookings = options.empty === true ? [] : bookingList(flags);
  const units = unitsHandler({
    canUpdate: flags.includes("update"),
    canCreate: flags.includes("create"),
  });
  const refuse = () =>
    options.refuse == null
      ? null
      : Response.json(
          {
            code: options.refuse.code,
            message: options.refuse.message,
            details: options.refuse.details,
          },
          { status: options.refuse.status },
        );
  const documents = mockSalesDocumentApi({
    files: options.files ?? [bookingFile("booking_form")],
    canUpload: flags.includes("update") || flags.includes("create"),
  });
  return (call: ApiCall): Response | undefined => {
    const path = call.path.split("?")[0] ?? "";
    const file = documents(call);
    if (file != null) return file;
    if (path === "/api/construction/sales/access")
      return Response.json(bookingAccess(flags));
    if (path.startsWith("/api/construction/sales/units")) return units(call);
    if (call.method === "GET" && path === BOOKINGS_API) {
      const query = new URLSearchParams(call.path.split("?")[1]);
      const statuses = query.get("status")?.split(",") ?? [];
      const search = query.get("search")?.toLowerCase() ?? "";
      const items = bookings.filter(
        (item) =>
          (statuses.length === 0 || statuses.includes(item.status)) &&
          (search === "" || item.customerName.toLowerCase().includes(search)),
      );
      return Response.json({
        items,
        nextCursor: null,
        prevCursor: null,
        total: items.length,
      } satisfies BookingPage);
    }
    if (call.method === "GET" && path === `${BOOKINGS_API}/form-options`)
      return Response.json(FORM_OPTIONS);
    if (call.method === "POST" && path === BOOKINGS_API)
      return (
        refuse() ??
        Response.json(booking({ id: NEW_ID }, flags), { status: 201 })
      );
    const item =
      /^\/api\/construction\/sales\/bookings\/([^/]+)(?:\/([a-z-]+))?$/.exec(
        path,
      );
    if (item != null) {
      const [, id, action] = item;
      const found =
        bookings.find((entry) => entry.id === id) ?? booking({}, flags);
      if (call.method === "GET" && action == null) return Response.json(found);
      if (call.method === "POST" && action === "delete")
        return refuse() ?? new Response(null, { status: 204 });
      if (call.method === "POST" && action === "confirm")
        return (
          refuse() ??
          Response.json(
            booking(
              {
                ...found,
                storedStatus: "booked",
                status: "booked",
                actions: undefined,
              },
              flags,
            ),
          )
        );
      if (call.method === "POST" && action === "cancel")
        return (
          refuse() ??
          Response.json(
            booking(
              {
                ...found,
                storedStatus: "cancelled",
                status: "cancelled",
                actions: undefined,
              },
              flags,
            ),
          )
        );
      if (call.method === "POST") return refuse() ?? Response.json(found);
    }
    return undefined;
  };
}

export function mockBookingApi(options: BookingApiOptions = {}) {
  return mockApi(bookingHandler(options));
}
