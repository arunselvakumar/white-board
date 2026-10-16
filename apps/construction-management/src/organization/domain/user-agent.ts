/** What My Profile → Devices says about a session's browser (CM-907). */
export type DeviceLabel = {
  /** "Chrome", "Safari", "Edge", … or "Unknown browser". */
  browser: string;
  /** "Android", "iOS", "Windows", "macOS", … or "Unknown system". */
  os: string;
  kind: "phone" | "tablet" | "desktop";
};

const UNKNOWN: DeviceLabel = {
  browser: "Unknown browser",
  os: "Unknown system",
  kind: "desktop",
};

// Order matters: Edge, Opera and Samsung Internet also say "Chrome", and
// Chrome also says "Safari".
const BROWSERS: readonly [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bUCBrowser\//, "UC Browser"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\b(?:Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
  [/\bMobile\/\w+\b(?!.*Safari)/, "Safari"],
];

const SYSTEMS: readonly [RegExp, string][] = [
  [/\b(?:iPhone|iPod)\b/, "iOS"],
  [/\biPad\b/, "iPadOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

/**
 * Browser, system and kind from a User-Agent header. A small local parser
 * on purpose: Devices only needs a recognisable label, not versions.
 */
export function parseUserAgent(
  userAgent: string | null | undefined,
): DeviceLabel {
  const ua = userAgent?.trim() ?? "";
  if (ua.length === 0) return UNKNOWN;
  const browser =
    BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? UNKNOWN.browser;
  const os = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? UNKNOWN.os;
  const tablet =
    os === "iPadOS" || (os === "Android" && !/\bMobile\b/.test(ua));
  const phone =
    !tablet && (os === "iOS" || os === "Android" || /\bMobi/.test(ua));
  return {
    browser,
    os,
    kind: tablet ? "tablet" : phone ? "phone" : "desktop",
  };
}
