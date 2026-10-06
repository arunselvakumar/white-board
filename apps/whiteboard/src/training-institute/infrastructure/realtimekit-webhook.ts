import { createVerify } from "node:crypto";

export type RealtimeKitEvent =
  | { event: "meeting.started"; meeting: { id: string } }
  | { event: "meeting.ended"; meeting: { id: string } }
  | {
      event: "recording.statusUpdate";
      recording: {
        id: string;
        meetingId: string;
        status: string;
        outputFileName?: string;
      };
    }
  | { event: string };

export async function verifyRealtimeKitWebhook(
  body: string,
  signature: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetcher(
    "https://api.realtime.cloudflare.com/.well-known/webhooks.json",
    { cache: "no-store" },
  );
  if (!response.ok)
    throw new Error("Could not fetch RealtimeKit webhook public key.");
  const payload: unknown = await response.json();
  const key =
    typeof payload === "object" &&
    payload != null &&
    "data" in payload &&
    typeof payload.data === "object" &&
    payload.data != null &&
    "publicKey" in payload.data
      ? payload.data.publicKey
      : null;
  if (typeof key !== "string")
    throw new Error("Invalid RealtimeKit webhook public key.");
  try {
    return createVerify("RSA-SHA256")
      .update(body)
      .end()
      .verify(key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export function parseRealtimeKitEvent(value: unknown): RealtimeKitEvent | null {
  if (
    typeof value !== "object" ||
    value == null ||
    !("event" in value) ||
    typeof value.event !== "string"
  )
    return null;
  if (value.event === "meeting.started" || value.event === "meeting.ended") {
    if (
      !("meeting" in value) ||
      typeof value.meeting !== "object" ||
      value.meeting == null ||
      !("id" in value.meeting) ||
      typeof value.meeting.id !== "string"
    )
      return null;
    return { event: value.event, meeting: { id: value.meeting.id } };
  }
  if (value.event === "recording.statusUpdate") {
    if (
      !("recording" in value) ||
      typeof value.recording !== "object" ||
      value.recording == null
    )
      return null;
    const recording = value.recording;
    if (
      !("id" in recording) ||
      typeof recording.id !== "string" ||
      !("meetingId" in recording) ||
      typeof recording.meetingId !== "string" ||
      !("status" in recording) ||
      typeof recording.status !== "string"
    )
      return null;
    const outputFileName =
      "outputFileName" in recording &&
      typeof recording.outputFileName === "string"
        ? recording.outputFileName
        : undefined;
    return {
      event: "recording.statusUpdate",
      recording: {
        id: recording.id,
        meetingId: recording.meetingId,
        status: recording.status,
        outputFileName,
      },
    };
  }
  return { event: value.event };
}
