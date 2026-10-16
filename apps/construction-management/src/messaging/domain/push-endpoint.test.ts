import { describe, expect, it } from "vitest";

import { isPushServiceEndpoint } from "./push-endpoint";

describe("isPushServiceEndpoint", () => {
  it("accepts the browsers' push services over HTTPS", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGx",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ])
      expect(isPushServiceEndpoint(endpoint)).toBe(true);
  });

  it("refuses other hosts, plain HTTP, look-alikes and credentials", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost:3002/api",
      "https://evilfcm.googleapis.com.attacker.test/x",
      "https://fcm.googleapis.com.attacker.test/x",
      "https://user:pass@fcm.googleapis.com/fcm/send/abc",
      "not a url",
    ])
      expect(isPushServiceEndpoint(endpoint)).toBe(false);
  });
});
