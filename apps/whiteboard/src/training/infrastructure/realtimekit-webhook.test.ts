import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { parseRealtimeKitEvent, verifyRealtimeKitWebhook } from "./realtimekit-webhook";

describe("RealtimeKit webhook", () => {
  it("verifies the exact signed body before accepting recording events", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const body = JSON.stringify({ event: "recording.statusUpdate", recording: { id: "rec_1", meetingId: "meet_1", status: "UPLOADED", outputFileName: "class.mp4" } });
    const signature = createSign("RSA-SHA256").update(body).end().sign(privateKey).toString("base64");
    const fetcher = () => Promise.resolve(Response.json({ success: true, data: { publicKey: publicKey.export({ type: "spki", format: "pem" }) } }));
    expect(await verifyRealtimeKitWebhook(body, signature, fetcher as typeof fetch)).toBe(true);
    expect(await verifyRealtimeKitWebhook(`${body} `, signature, fetcher as typeof fetch)).toBe(false);
    expect(parseRealtimeKitEvent(JSON.parse(body) as unknown)).toEqual({ event: "recording.statusUpdate", recording: { id: "rec_1", meetingId: "meet_1", status: "UPLOADED", outputFileName: "class.mp4" } });
  });
});
