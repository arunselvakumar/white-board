import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { realtimeKitConfigFromEnv } from "./realtimekit-meeting-gateway";

export async function signedClassRecordingUrl(objectKey: string): Promise<string> {
  const config = realtimeKitConfigFromEnv();
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.r2AccessKeyId, secretAccessKey: config.r2SecretAccessKey },
  });
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: config.r2Bucket,
    Key: objectKey,
    ResponseContentDisposition: `attachment; filename="${objectKey.split("/").at(-1) ?? "class-recording.mp4"}"`,
  }), { expiresIn: 60 });
}
