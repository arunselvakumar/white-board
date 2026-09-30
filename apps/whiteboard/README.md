# Whiteboard

The Whiteboard Next.js application.

```sh
bun run dev --filter=whiteboard
```

Runs on [http://localhost:3000/app](http://localhost:3000/app).

## Teacher private data

Set `TEACHER_PRIVATE_DATA_KEY` to a base64-encoded 32-byte random key in
`apps/whiteboard/.env.local` and in every deployment before saving Teacher ID
numbers, bank account numbers, or documents. Generate one with
`openssl rand -base64 32`. Keep it outside version control and retain it with
backups: losing the key makes previously stored private data unreadable. Existing
Teacher profiles without private data work without the key.

## Online classes

Online and Hybrid Batches can use an external HTTPS meeting link or a Whiteboard class. Every Calendar event opens a class pre-join page. Whiteboard classes use [Cloudflare RealtimeKit](https://developers.cloudflare.com/realtime/realtimekit/quickstart/) and save recordings to a private [R2 bucket](https://developers.cloudflare.com/realtime/realtimekit/recording-guide/custom-cloud-storage/). External links are not recorded by Whiteboard.

To enable Whiteboard classes in a deployed environment:

1. Create a RealtimeKit App in the Cloudflare account and create host and Student permission presets. The host preset must allow the Teacher to host the meeting; avoid granting participants manual recording controls. Copy the preset names into the environment variables below.
2. Create a **private** R2 bucket for recordings and R2 API credentials restricted to that bucket. Keep the bucket private; Whiteboard issues 60-second signed download redirects only to the Owner or assigned Teacher.
3. Create a Cloudflare API token with RealtimeKit permission for the app. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_REALTIMEKIT_APP_ID`, `CLOUDFLARE_REALTIMEKIT_API_TOKEN`, `CLOUDFLARE_REALTIMEKIT_HOST_PRESET`, `CLOUDFLARE_REALTIMEKIT_STUDENT_PRESET`, `CLOUDFLARE_R2_RECORDINGS_BUCKET`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, and `CLOUDFLARE_R2_SECRET_ACCESS_KEY` in the deployed server environment. Never expose these as `NEXT_PUBLIC_` variables.
4. Register an enabled [RealtimeKit webhook](https://developers.cloudflare.com/realtime/realtimekit/webhooks/) pointing to `https://<whiteboard-host>/app/api/webhooks/realtimekit` for `meeting.started`, `meeting.ended`, and `recording.statusUpdate`. Set `CLOUDFLARE_REALTIMEKIT_WEBHOOK_ID` to the webhook configuration ID. The endpoint verifies Cloudflare's RSA signature and this ID before processing events.
5. Apply Prisma migrations to the deployed Postgres database (`bun run --filter @repo/db migrate:deploy`), deploy Whiteboard, and verify a real class: host joins, recording reaches `RECORDING`, Student joins, host ends, recording reaches `UPLOADED`, Owner downloads the file. Keep the R2 credentials and webhook configuration in the deployment secret store.

The class remains in a waiting state until recording is active. Cloudflare recording and R2 usage are billed separately; set a bucket lifecycle/retention policy before production use. Cloudflare RealtimeKit and R2 resources are not provisioned by this repository.
