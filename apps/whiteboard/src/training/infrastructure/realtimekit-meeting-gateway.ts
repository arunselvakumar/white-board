import type {
  ClassOccurrenceRecord,
  MeetingGateway,
} from "../application/class-service";
import { DomainError } from "../domain/errors";

export type RealtimeKitConfig = {
  accountId: string;
  appId: string;
  apiToken: string;
  hostPreset: string;
  studentPreset: string;
  r2Bucket: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
};

export class RealtimeKitMeetingGateway implements MeetingGateway {
  constructor(
    private readonly config: RealtimeKitConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  ensureConfigured(): void {
    if (Object.values(this.config).some((value) => value.trim().length === 0)) {
      throw new DomainError(
        "CLASS_NOT_CONFIGURED",
        "Whiteboard classes need Cloudflare RealtimeKit and R2 configuration.",
      );
    }
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/realtime/kit/${this.config.appId}${path}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const payload: unknown = await response.json();
    if (
      !response.ok ||
      typeof payload !== "object" ||
      payload == null ||
      !("success" in payload) ||
      payload.success !== true ||
      !("data" in payload) ||
      typeof payload.data !== "object" ||
      payload.data == null
    ) {
      throw new DomainError(
        "CLASS_PROVIDER_UNAVAILABLE",
        "Whiteboard classes are temporarily unavailable.",
      );
    }
    return payload.data as Record<string, unknown>;
  }

  async createMeeting(title: string): Promise<string> {
    const data = await this.post("/meetings", {
      title,
      record_on_start: false,
    });
    if (typeof data["id"] !== "string")
      throw new DomainError(
        "CLASS_PROVIDER_UNAVAILABLE",
        "Whiteboard could not create this class.",
      );
    return data["id"];
  }

  async addParticipant(
    meetingId: string,
    input: { userId: string; name: string; host: boolean },
  ): Promise<string> {
    const data = await this.post(`/meetings/${meetingId}/participants`, {
      name: input.name,
      preset_name: input.host
        ? this.config.hostPreset
        : this.config.studentPreset,
      custom_participant_id: `${input.userId}:${crypto.randomUUID()}`,
    });
    const token = data["token"] ?? data["authToken"];
    if (typeof token !== "string")
      throw new DomainError(
        "CLASS_PROVIDER_UNAVAILABLE",
        "Whiteboard could not open this class.",
      );
    return token;
  }

  async startRecording(
    meetingId: string,
    occurrence: ClassOccurrenceRecord,
  ): Promise<string> {
    const data = await this.post("/recordings", {
      meeting_id: meetingId,
      video_config: { codec: "H264", export_file: true },
      storage_config: {
        type: "cloudflare",
        account_id: this.config.accountId,
        bucket: this.config.r2Bucket,
        access_key: this.config.r2AccessKeyId,
        secret: this.config.r2SecretAccessKey,
        path: `${occurrence.workspaceId}/${occurrence.id}`,
      },
    });
    if (typeof data["id"] !== "string")
      throw new DomainError(
        "CLASS_PROVIDER_UNAVAILABLE",
        "Whiteboard could not record this class.",
      );
    return data["id"];
  }

  async endMeeting(meetingId: string): Promise<void> {
    await this.post(`/meetings/${meetingId}/active-session/kick-all`, {});
    await this.deactivateMeeting(meetingId);
  }

  async deactivateMeeting(meetingId: string): Promise<void> {
    const response = await this.fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/realtime/kit/${this.config.appId}/meetings/${meetingId}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${this.config.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "INACTIVE" }),
      },
    );
    const payload: unknown = await response.json();
    if (
      !response.ok ||
      typeof payload !== "object" ||
      payload == null ||
      !("success" in payload) ||
      payload.success !== true
    ) {
      throw new DomainError(
        "CLASS_PROVIDER_UNAVAILABLE",
        "Whiteboard could not close this class.",
      );
    }
  }
}

export function realtimeKitConfigFromEnv(): RealtimeKitConfig {
  const value = (key: string) => {
    const result = process.env[key]?.trim();
    if (!result)
      throw new DomainError(
        "CLASS_NOT_CONFIGURED",
        "Whiteboard classes need Cloudflare RealtimeKit and R2 configuration.",
      );
    return result;
  };
  return {
    accountId: value("CLOUDFLARE_ACCOUNT_ID"),
    appId: value("CLOUDFLARE_REALTIMEKIT_APP_ID"),
    apiToken: value("CLOUDFLARE_REALTIMEKIT_API_TOKEN"),
    hostPreset: value("CLOUDFLARE_REALTIMEKIT_HOST_PRESET"),
    studentPreset: value("CLOUDFLARE_REALTIMEKIT_STUDENT_PRESET"),
    r2Bucket: value("CLOUDFLARE_R2_RECORDINGS_BUCKET"),
    r2AccessKeyId: value("CLOUDFLARE_R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: value("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
  };
}
