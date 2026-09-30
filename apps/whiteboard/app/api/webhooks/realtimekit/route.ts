import { createClassService } from "@/src/training/infrastructure/create-class-service";
import { parseRealtimeKitEvent, verifyRealtimeKitWebhook } from "@/src/training/infrastructure/realtimekit-webhook";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("rtk-signature");
  const expectedWebhookId = process.env["CLOUDFLARE_REALTIMEKIT_WEBHOOK_ID"];
  if (!signature || !expectedWebhookId || request.headers.get("rtk-webhook-id") !== expectedWebhookId) return new Response(null, { status: 401 });
  const body = await request.text();
  try {
    if (!await verifyRealtimeKitWebhook(body, signature)) return new Response(null, { status: 401 });
    const event = parseRealtimeKitEvent(JSON.parse(body) as unknown);
    if (event == null) return new Response(null, { status: 400 });
    const service = createClassService();
    if (event.event === "meeting.started" && "meeting" in event) await service.meetingStarted(event.meeting.id);
    if (event.event === "meeting.ended" && "meeting" in event) await service.meetingEnded(event.meeting.id);
    if (event.event === "recording.statusUpdate" && "recording" in event) await service.recordingChanged({ meetingId: event.recording.meetingId, recordingId: event.recording.id, status: event.recording.status, outputFileName: event.recording.outputFileName });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("RealtimeKit webhook failed", error);
    return new Response(null, { status: 503 });
  }
}
