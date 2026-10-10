import type {
  GalleryItem,
  GalleryUploader,
} from "@/src/queries/project-gallery";

import { mockApi } from "../../../.storybook/mocks/api";
import { ANUGRAHA } from "../documents/document-fixtures";

/** Story fixtures for the Project Gallery (CM-410). */
export const GALLERY_PROJECT_ID = ANUGRAHA.id;

const PROJECT_API = `/api/construction/projects/projects/${GALLERY_PROJECT_ID}`;

export const GALLERY_API = `${PROJECT_API}/gallery`;

/** The page size `galleryQuery` asks for. */
export const GALLERY_PAGE_SIZE = 48;

const KB = 1024;
const MB = 1024 * KB;

/**
 * A small coloured picture, so tiles and the viewer show an image without a
 * server. `kind` keeps a thumbnail's address apart from its full image's.
 */
function picture(color: string, kind: "thumb" | "full"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><!--${kind}--><rect width="4" height="3" fill="${color}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const UPLOADERS = {
  karthik: { userId: "user-karthik", name: "Karthik R" },
  meena: { userId: "user-meena", name: "Meena S" },
  prakash: { userId: "user-prakash", name: "Prakash" },
  /** Left the Company; the name is no longer known. */
  gone: { userId: "user-gone", name: null },
} satisfies Record<string, GalleryUploader>;

type Uploader = keyof typeof UPLOADERS;

function item(
  n: number,
  input: {
    source: "document" | "drawing" | "testing_report";
    fileName: string;
    bytes: number;
    uploadedAt: string;
    by: Uploader;
    /** An image's colour; a PDF has none. */
    color?: string;
    thumb?: boolean;
  },
): GalleryItem {
  const id = `0199c4a0-0000-7000-8000-0000000e${String(n).padStart(4, "0")}`;
  const sourceId = `0199c4a0-0000-7000-8000-0000000f${String(n).padStart(4, "0")}`;
  const image = input.color != null;
  const fileUrl = image
    ? picture(input.color ?? "", "full")
    : input.source === "document"
      ? `${PROJECT_API}/documents/${sourceId}`
      : input.source === "drawing"
        ? `${PROJECT_API}/drawings/${sourceId}/revisions/${id}/file`
        : `${PROJECT_API}/testing-reports/reports/${sourceId}/file`;
  const uploader = UPLOADERS[input.by];
  return {
    id,
    type: image ? "image" : "pdf",
    source: input.source,
    sourceId,
    fileName: input.fileName,
    contentType: image
      ? input.fileName.endsWith(".png")
        ? "image/png"
        : "image/jpeg"
      : "application/pdf",
    bytes: Math.round(input.bytes),
    fileUrl,
    thumbUrl:
      image && input.thumb === true
        ? picture(input.color ?? "", "thumb")
        : null,
    uploadedBy: uploader.userId,
    uploadedByName: uploader.name,
    uploadedAt: input.uploadedAt,
  };
}

/** The files the stories look at by name, newest first. */
export const SLAB_PHOTO = item(1, {
  source: "document",
  fileName: "Slab casting 3rd floor.jpg",
  bytes: 1.2 * MB,
  uploadedAt: "2026-10-08T05:30:00Z",
  by: "karthik",
  color: "#94a3b8",
  thumb: true,
});

export const COLUMN_LAYOUT = item(2, {
  source: "drawing",
  fileName: "Column layout.pdf",
  bytes: 2.4 * MB,
  uploadedAt: "2026-10-06T09:00:00Z",
  by: "meena",
});

export const CUBE_TEST = item(3, {
  source: "testing_report",
  fileName: "Cube test 28 day.pdf",
  bytes: 340 * KB,
  uploadedAt: "2026-10-02T07:15:00Z",
  by: "prakash",
});

/** An image with no thumbnail: the tile shows the image itself. */
export const SITE_VISIT = item(4, {
  source: "document",
  fileName: "Site visit east side.png",
  bytes: 3.1 * MB,
  uploadedAt: "2026-09-28T11:45:00Z",
  by: "karthik",
  color: "#a16207",
});

export const GF_PLAN = item(5, {
  source: "drawing",
  fileName: "GF plan.png",
  bytes: 860 * KB,
  uploadedAt: "2026-09-20T06:00:00Z",
  by: "meena",
  color: "#0369a1",
  thumb: true,
});

export const STEEL_TEST = item(6, {
  source: "testing_report",
  fileName: "Steel test report.jpg",
  bytes: 620 * KB,
  uploadedAt: "2026-10-01T08:20:00Z",
  by: "gone",
  color: "#4d7c0f",
  thumb: true,
});

export const WORK_ORDER = item(7, {
  source: "document",
  fileName: "Work order signed.pdf",
  bytes: 1.2 * MB,
  uploadedAt: "2026-09-03T04:40:00Z",
  by: "karthik",
});

const PHOTO_COLORS = ["#78716c", "#b45309", "#0f766e", "#6d28d9", "#be123c"];

/** Daily site photos before September, so the Gallery runs past one page. */
const SITE_PHOTOS: GalleryItem[] = Array.from({ length: 53 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 7, 31 - index, 6, 0, 0));
  return item(100 + index, {
    source: "document",
    fileName: `Site photo ${String(index + 1).padStart(2, "0")}.jpg`,
    bytes: 900 * KB + index * 10 * KB,
    uploadedAt: day.toISOString().replace(".000Z", "Z"),
    by: index % 2 === 0 ? "karthik" : "prakash",
    color: PHOTO_COLORS[index % PHOTO_COLORS.length],
    thumb: true,
  });
});

/** Newest first, as the API lists them: 60 files. */
export const GALLERY_ITEMS: GalleryItem[] = [
  SLAB_PHOTO,
  COLUMN_LAYOUT,
  CUBE_TEST,
  STEEL_TEST,
  SITE_VISIT,
  GF_PLAN,
  WORK_ORDER,
  ...SITE_PHOTOS,
];

/** By name, an unknown name last, as `gallery/uploaders` answers. */
export const GALLERY_UPLOADERS: GalleryUploader[] = [
  UPLOADERS.karthik,
  UPLOADERS.meena,
  UPLOADERS.prakash,
  UPLOADERS.gone,
];

/** The day an upload falls on in the Company time zone (IST). */
function istDay(instant: string): string {
  const shifted = new Date(Date.parse(instant) + 330 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** Applies the Gallery's query string to `items`, as the API does. */
export function galleryPage(items: GalleryItem[], search: URLSearchParams) {
  const type = search.get("type");
  const source = search.get("source");
  const uploadedBy = search.get("uploadedBy");
  const from = search.get("from");
  const to = search.get("to");
  const q = search.get("q")?.toLowerCase();
  const limit = Number(search.get("limit") ?? GALLERY_PAGE_SIZE);
  const matching = items.filter(
    (row) =>
      (type == null || row.type === type) &&
      (source == null || row.source === source) &&
      (uploadedBy == null || row.uploadedBy === uploadedBy) &&
      (from == null || istDay(row.uploadedAt) >= from) &&
      (to == null || istDay(row.uploadedAt) <= to) &&
      (q == null || row.fileName.toLowerCase().includes(q)),
  );
  const after = search.get("after");
  const before = search.get("before");
  let start = 0;
  let end = limit;
  if (after != null) {
    start = matching.findIndex((row) => row.id === after) + 1;
    end = start + limit;
  } else if (before != null) {
    end = matching.findIndex((row) => row.id === before);
    start = Math.max(0, end - limit);
  }
  const pageItems = matching.slice(start, end);
  const last = pageItems.at(-1);
  const first = pageItems.at(0);
  return {
    items: pageItems,
    nextCursor:
      last != null && start + pageItems.length < matching.length
        ? last.id
        : null,
    prevCursor: first != null && start > 0 ? first.id : null,
    total: matching.length,
  };
}

/**
 * A Gallery API for one story: the list honours every filter and the
 * cursors on `items`; the uploaders list is fixed.
 */
export function mockGalleryApi(
  options: { items?: GalleryItem[]; uploaders?: GalleryUploader[] } = {},
) {
  const items = options.items ?? GALLERY_ITEMS;
  const uploaders = options.uploaders ?? GALLERY_UPLOADERS;
  return mockApi((call) => {
    if (call.method !== "GET") return undefined;
    const url = new URL(call.path, "http://storybook.local");
    if (url.pathname === `${GALLERY_API}/uploaders`)
      return Response.json({ items: uploaders });
    if (url.pathname === GALLERY_API)
      return Response.json(galleryPage(items, url.searchParams));
    return undefined;
  });
}
