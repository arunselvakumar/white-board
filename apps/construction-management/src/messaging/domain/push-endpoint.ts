/**
 * Browser push services we send to (CM-904). A subscription's endpoint
 * comes from the browser, but the request carrying it comes from a user,
 * so the server only ever posts to these hosts over HTTPS: never to an
 * address a user typed in.
 */
const PUSH_SERVICE_HOSTS: readonly string[] = [
  // Chrome, and Chromium browsers on Firebase Cloud Messaging.
  "fcm.googleapis.com",
  "android.googleapis.com",
  // Firefox.
  "push.services.mozilla.com",
  // Safari.
  "push.apple.com",
  // Edge (Windows Push Notification Services).
  "notify.windows.com",
];

/** True for an `https:` URL on a known push service (or a subdomain). */
export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "")
    return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}
