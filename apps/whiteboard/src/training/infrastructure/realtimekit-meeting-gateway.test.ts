import { describe, expect, it } from "vitest";

import { RealtimeKitMeetingGateway } from "./realtimekit-meeting-gateway";

const config = {
  accountId: "cf-account", appId: "cf-app", apiToken: "secret",
  hostPreset: "teacher", studentPreset: "student",
  r2Bucket: "recordings", r2AccessKeyId: "access", r2SecretAccessKey: "secret-key",
};

describe("RealtimeKitMeetingGateway", () => {
  it("creates a meeting and requests a recording in private R2 storage", async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const ids = ["meeting-1", "recording-1"];
    const fetcher = (url: string | URL | Request, init?: RequestInit) => {
      const urlText = url instanceof Request ? url.url : url.toString();
      const body = typeof init?.body === "string" ? init.body : "{}";
      requests.push({ url: urlText, body: JSON.parse(body) as Record<string, unknown> });
      return Promise.resolve(Response.json({ success: true, data: { id: ids.shift() } }));
    };
    const gateway = new RealtimeKitMeetingGateway(config, fetcher);
    const meetingId = await gateway.createMeeting("DCA · Morning Batch");
    const recordingId = await gateway.startRecording(meetingId, {
      id: "occurrence-1", workspaceId: "org_1", batchId: "batch-1", date: "2026-09-30", startTime: "09:00", endTime: "10:00",
      providerMeetingId: meetingId, status: "starting", recordingId: null, recordingStatus: "pending", recordingObjectKey: null,
    });
    expect(recordingId).toBe("recording-1");
    expect(requests[0]?.body).toEqual({ title: "DCA · Morning Batch", record_on_start: false });
    expect(requests[1]?.body).toMatchObject({ meeting_id: "meeting-1", video_config: { codec: "H264", export_file: true }, storage_config: { type: "cloudflare", bucket: "recordings", path: "org_1/occurrence-1", account_id: "cf-account" } });
  });

  it("uses Cloudflare's participant token and a fresh participant ID on each join", async () => {
    const ids: string[] = [];
    const fetcher = (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { custom_participant_id: string };
      ids.push(body.custom_participant_id);
      return Promise.resolve(Response.json({ success: true, data: { token: "join-token" } }));
    };
    const gateway = new RealtimeKitMeetingGateway(config, fetcher);
    expect(await gateway.addParticipant("meeting-1", { userId: "user_1", name: "Meera", host: true })).toBe("join-token");
    expect(await gateway.addParticipant("meeting-1", { userId: "user_1", name: "Meera", host: true })).toBe("join-token");
    expect(ids[0]).not.toBe(ids[1]);
  });
});
