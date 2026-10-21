import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionSalesBookingFileResponse,
  ListConstructionSalesBookingFilesResponse,
} from "@/app/api/construction/sales/bookings/booking-file-models";
import type {
  ConstructionSalesBookingDetailResponse,
  ConstructionSalesBookingResponse,
  CreateConstructionSalesBookingRequestModel,
  GetConstructionSalesBookingFormOptionsResponse,
  ListConstructionSalesBookingsResponse,
  UpdateConstructionSalesBookingRequestModel,
} from "@/app/api/construction/sales/bookings/booking-models";
import { formatBytes } from "@/lib/project-documents";
import type { BookingFileRole } from "@/src/sales/application/booking-files";
import type { BookingDisplayStatus } from "@/src/sales/domain/booking";
import { isProgramName } from "@/src/shared-kernel/attachments/program-names";
import { acceptedExtensions } from "@/src/shared-kernel/attachments/upload-policy";
import { fileExtension } from "@/src/shared-kernel/files/file-name";

import { directUpload, postJson } from "./direct-upload";
import { apiJson, QueryHttpError } from "./http";
import { SALES_API, SALES_KEY } from "./sales-access";
import { bookingsModulePath, UNITS_KEY } from "./sales-units";

export type Booking = ConstructionSalesBookingResponse;
export type BookingDetail = ConstructionSalesBookingDetailResponse;
export type BookingPage = ListConstructionSalesBookingsResponse;
export type BookingFormOptions = GetConstructionSalesBookingFormOptionsResponse;
export type BookingFile = ConstructionSalesBookingFileResponse;
export type BookingFiles = ListConstructionSalesBookingFilesResponse;
export type CreateBookingInput = z.input<
  typeof CreateConstructionSalesBookingRequestModel
>;
export type UpdateBookingInput = z.input<
  typeof UpdateConstructionSalesBookingRequestModel
>;

export const BOOKINGS_API = `${SALES_API}/bookings`;
/** Every Bookings read (CM-1006); writes invalidate it and the Units chart. */
export const BOOKINGS_KEY = [...SALES_KEY, "bookings"] as const;

/** Pages of the Bookings tab: the list, a booking, its edit page. */
export function bookingsPath(projectId: string, id?: string): string {
  const base = bookingsModulePath(projectId, "list");
  return id == null ? base : `${base}/${encodeURIComponent(id)}`;
}

export type BookingFilters = {
  statuses?: readonly BookingDisplayStatus[];
  wingId?: string;
  search?: string;
  cursor?: { after?: string; before?: string } | null;
};

/** The query string of a list request (shared with the stories' mock). */
export function bookingListParams(
  projectId: string,
  filters: BookingFilters = {},
): URLSearchParams {
  const params = new URLSearchParams({ projectId, limit: "25" });
  const set = (key: string, value: string | undefined) => {
    if (value != null && value !== "") params.set(key, value);
  };
  if (filters.statuses != null && filters.statuses.length > 0)
    params.set("status", filters.statuses.join(","));
  set("wingId", filters.wingId);
  set("search", filters.search?.trim());
  set("after", filters.cursor?.after);
  set("before", filters.cursor?.before);
  return params;
}

export function bookingsQuery(projectId: string, filters: BookingFilters = {}) {
  const params = bookingListParams(projectId, filters);
  return queryOptions({
    queryKey: [...BOOKINGS_KEY, "list", params.toString()],
    queryFn: () => apiJson<BookingPage>(`${BOOKINGS_API}?${params}`),
  });
}

export function bookingQuery(id: string) {
  return queryOptions({
    queryKey: [...BOOKINGS_KEY, "detail", id],
    queryFn: () =>
      apiJson<BookingDetail>(`${BOOKINGS_API}/${encodeURIComponent(id)}`),
  });
}

/** The units that can be booked now, by Wing. */
export function bookingFormOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...BOOKINGS_KEY, "form-options", projectId],
    queryFn: () =>
      apiJson<BookingFormOptions>(
        `${BOOKINGS_API}/form-options?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${BOOKINGS_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: BOOKINGS_KEY }),
      client.invalidateQueries({ queryKey: UNITS_KEY }),
    ]);
  };
}

const item = (id: string, action: string) =>
  `/${encodeURIComponent(id)}/${action}`;

/** Hold or Book a unit. */
export function useCreateBooking() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateBookingInput) => post<BookingDetail>("", input),
    onSuccess: invalidate,
  });
}

export function useUpdateBooking(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateBookingInput) =>
      post<BookingDetail>(item(id, "update"), input),
    onSuccess: invalidate,
  });
}

export type BookingActionInput =
  | { action: "confirm"; confirmedOn: string }
  | { action: "extend-hold"; holdUntil: string }
  | { action: "cancel"; reason: string; cancelledOn: string };

/** Confirm, Extend hold or Cancel, sending the `updatedAt` last seen. */
export function useBookingAction(booking: { id: string; updatedAt: string }) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ action, ...body }: BookingActionInput) =>
      post<BookingDetail>(item(booking.id, action), {
        ...body,
        expectedUpdatedAt: booking.updatedAt,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteBooking(booking: { id: string; updatedAt: string }) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      post<undefined>(item(booking.id, "delete"), {
        expectedUpdatedAt: booking.updatedAt,
      }),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Files: the Booking Form and photos (personal data, not in the Gallery)
// ---------------------------------------------------------------------------

export const BOOKING_FILE_MAX_BYTES = 25 * 1024 * 1024;

export function bookingFilesKey(id: string) {
  return [...BOOKINGS_KEY, "files", id] as const;
}

export function bookingFilesQuery(id: string) {
  return queryOptions({
    queryKey: bookingFilesKey(id),
    queryFn: () =>
      apiJson<BookingFiles>(`${BOOKINGS_API}/${encodeURIComponent(id)}/files`),
  });
}

/** What a role takes: the Booking Form a PDF or a photo; photos images only. */
export function bookingFileAccept(role: BookingFileRole): string {
  return role === "photo"
    ? "image/png,image/jpeg,image/webp"
    : "application/pdf,image/png,image/jpeg,image/webp";
}

/** What the browser can refuse before any byte moves; null when it may go up. */
export function checkBookingFile(
  role: BookingFileRole,
  file: { name: string; size: number },
): string | null {
  const accept = role === "photo" ? "images" : "pdf_or_image";
  const allowed = acceptedExtensions(accept) ?? [];
  const extension = fileExtension(file.name);
  if (
    isProgramName(file.name) ||
    extension == null ||
    !allowed.includes(extension)
  )
    return role === "photo"
      ? "Only photos (PNG, JPEG or WebP) can be added here."
      : "Only a PDF or a photo (PNG, JPEG or WebP) can be added here.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > BOOKING_FILE_MAX_BYTES)
    return `Files can be at most ${formatBytes(BOOKING_FILE_MAX_BYTES)}.`;
  return null;
}

/** Uploads one file to a booking: start, the bytes, a thumbnail, complete. */
export async function uploadBookingFile(
  id: string,
  role: BookingFileRole,
  file: File,
): Promise<BookingFile> {
  const problem = checkBookingFile(role, file);
  if (problem != null)
    throw new QueryHttpError(400, {
      code: "FILE_TYPE_NOT_ALLOWED",
      message: problem,
    });
  const base = `${BOOKINGS_API}/${encodeURIComponent(id)}/files`;
  return directUpload({
    startUrl: `${base}/uploads`,
    startBody: { role },
    file,
    complete: (started, signal) =>
      postJson<BookingFile>(
        base,
        { role, key: started.key, fileName: started.fileName },
        signal,
      ),
  });
}

export function useUploadBookingFile(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { role: BookingFileRole; file: File }) =>
      uploadBookingFile(id, input.role, input.file),
    onSettled: () =>
      client.invalidateQueries({ queryKey: bookingFilesKey(id) }),
  });
}

export function useRemoveBookingFile(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) =>
      postJson<undefined>(
        `${BOOKINGS_API}/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}/delete`,
        {},
      ),
    onSettled: () =>
      client.invalidateQueries({ queryKey: bookingFilesKey(id) }),
  });
}
