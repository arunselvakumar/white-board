import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { kindFromSegment } from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-format";
import { CheckInCaptureScreen } from "@/app/app/projects/[id]/attendance/check-in/[kind]/[personId]/_components/check-in-capture-screen";

export const metadata: Metadata = { title: "Check-In" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `[kind]` is `labour`, `site-engineer` or `vendor`; anything else is not found. */
export default async function ProjectCheckInCapturePage({
  params,
}: {
  params: Promise<{ id: string; kind: string; personId: string }>;
}) {
  const { id, kind, personId } = await params;
  const personKind = kindFromSegment(kind);
  if (personKind == null || !UUID.test(personId)) notFound();
  return (
    <CheckInCaptureScreen
      projectId={id}
      kind={personKind}
      personId={personId.toLowerCase()}
    />
  );
}
