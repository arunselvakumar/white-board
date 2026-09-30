# Whiteboard Online Classes

## Intent

An Online or Hybrid Batch can use an external meeting URL or a Whiteboard class. Every participant opens a Whiteboard pre-join page. Whiteboard classes use Cloudflare RealtimeKit and are recorded automatically, with a durable recording download managed by Whiteboard. External meetings remain on the chosen provider and have no Whiteboard recording guarantee.

## Scope

- Signed-in Users in the Active Workspace only. Owners and assigned Teachers host; Students and Parents join only their active Enrollments.
- The Class Mode remains on Batch with the existing Enrollment override. Offline classes have no online join action.
- A Batch stores `meetingOption: external | whiteboard`, defaulting to `external` for existing rows. `joinUrl` applies only to `external`.
- A class occurrence is identified by Batch, local date, and a scheduled start time. It is created on demand; recurring Timings remain the schedule source.
- Whiteboard classes have one RealtimeKit meeting per occurrence. Whiteboard stores provider meeting ID and recording status/key, never a long-lived participant token.
- The pre-join page shows Course, Batch, date/time, and recording status. The Whiteboard path adds camera/microphone preview and device controls through the RealtimeKit UI kit. The external path opens the saved URL in a new tab.
- The Teacher starts a Whiteboard class. Students/Parents see a waiting state until then. On the signed `meeting.started` webhook, Whiteboard starts recording with a per-class private R2 destination. Whiteboard keeps the class in a starting state until the provider reports that recording is active, then admits Students/Parents. A recording failure is shown and prevents the class from opening, because recording is mandatory.
- Cloudflare uploads the finished recording to a private R2 bucket. A verified webhook marks it ready. Owner and assigned Teacher can download via a short-lived signed URL. Student/Parent recording access is deferred.

## Boundaries

- `training` domain/application owns meeting choice, occurrence identity, access policy, and recording state. Provider calls are behind an application port, implemented in infrastructure.
- Next.js Route Handlers authenticate and validate HTTP models. They obtain Active Workspace from the Session and expose named operations; every route appears in OpenAPI.
- Cloudflare API token and R2 credentials stay server-side. Whiteboard issues a RealtimeKit participant token only after checking Workspace, role, Batch assignment or Enrollment, occurrence time, and class state.
- The existing `joinUrl` field stays for external meetings. No attempt is made to record Google Meet, Teams, or other external meetings.

## Failure behavior

- Missing Session 401; no Active Workspace 403; inaccessible Batch/occurrence 404.
- Missing external URL disables joining with explanatory copy.
- Missing Cloudflare configuration disables starting with an actionable Owner/Teacher error.
- Recording errors remain visible on the class page. Webhooks are signature-checked and idempotent.
- Completed recordings are not exposed until upload finishes. R2 object keys are never treated as public URLs.

## Verification

Domain tests cover choice, occurrence identity, access, and recording transitions. Postgres HTTP tests cover Workspace and role isolation. Storybook play functions cover both pre-join branches, waiting, and recording states. Verify typecheck, unit/HTTP tests, Storybook, and a browser flow with Cloudflare credentials when available.
