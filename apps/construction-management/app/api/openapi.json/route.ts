import { openApiDocument } from "@/app/api/_lib/openapi-document";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(openApiDocument, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
