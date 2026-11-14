/**
 * Stands in for `navigator.geolocation` in one story: a fixed position, an
 * error by code (1 permission denied, 2 unavailable, 3 timeout), or
 * `"pending"` for a device still looking. The Permissions API answers for
 * the location too: `denied` after code 1 and `granted` otherwise, unless
 * `permission` says the browser would still have to ask (`"prompt"`).
 * Returns a restore function for `beforeEach`.
 */
export function mockGeolocation(
  result:
    | { latitude: number; longitude: number; accuracy: number }
    | { code: 1 | 2 | 3 }
    | "pending",
  options: { permission?: PermissionState } = {},
): () => void {
  const state: PermissionState =
    options.permission ??
    (typeof result === "object" && "code" in result && result.code === 1
      ? "denied"
      : "granted");
  const permissions = navigator.permissions;
  const realQuery = permissions.query.bind(permissions);
  Object.defineProperty(permissions, "query", {
    configurable: true,
    value: (descriptor: PermissionDescriptor) =>
      descriptor.name === "geolocation"
        ? Promise.resolve({ state } as PermissionStatus)
        : realQuery(descriptor),
  });
  const stub: Pick<Geolocation, "getCurrentPosition"> = {
    getCurrentPosition(success, failure) {
      if (result === "pending") return;
      if ("code" in result) {
        failure?.({
          code: result.code,
          message: "mocked",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
        return;
      }
      success({
        coords: {
          latitude: result.latitude,
          longitude: result.longitude,
          accuracy: result.accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      });
    },
  };
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: stub,
  });
  return () => {
    Reflect.deleteProperty(navigator, "geolocation");
    Reflect.deleteProperty(permissions, "query");
  };
}
