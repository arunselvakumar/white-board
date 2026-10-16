/* Construction Management service worker: web push (CM-904, ADR CM-0021 §6).
 * Plain JS, no imports. The server sends a JSON payload
 * { title, body, href, tag?, icon? }. */

const DEFAULT_ICON = "/favicon.ico";
const DEFAULT_HREF = "/app";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

/** A same-origin path; anything else opens the app home. */
function safeHref(href) {
  if (typeof href !== "string" || href.length === 0) return DEFAULT_HREF;
  try {
    const url = new URL(href, self.location.origin);
    return url.origin === self.location.origin
      ? url.pathname + url.search + url.hash
      : DEFAULT_HREF;
  } catch {
    return DEFAULT_HREF;
  }
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  const title =
    typeof payload.title === "string" && payload.title.length > 0
      ? payload.title
      : "Construction Management";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: typeof payload.icon === "string" ? payload.icon : DEFAULT_ICON,
    badge: DEFAULT_ICON,
    data: { href: safeHref(payload.href) },
  };
  if (typeof payload.tag === "string" && payload.tag.length > 0)
    options.tag = payload.tag;
  event.waitUntil(self.registration.showNotification(title, options));
});

async function openHref(href) {
  const target = new URL(href, self.location.origin).href;
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const exact = windows.find((client) => client.url === target);
  if (exact) return exact.focus();
  const sameOrigin = windows.find(
    (client) => new URL(client.url).origin === self.location.origin,
  );
  if (sameOrigin) {
    const focused = await sameOrigin.focus();
    if ("navigate" in focused) return focused.navigate(target);
    return focused;
  }
  return self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = safeHref(
    event.notification.data && event.notification.data.href,
  );
  event.waitUntil(openHref(href));
});
