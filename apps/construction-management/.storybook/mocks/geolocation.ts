/**
 * Stands in for `navigator.geolocation` in one story: a fixed position, or
 * an error by code (1 permission denied, 2 unavailable, 3 timeout).
 * Returns a restore function for `beforeEach`.
 */
export function mockGeolocation(
  result:
    | { latitude: number; longitude: number; accuracy: number }
    | { code: 1 | 2 | 3 },
): () => void {
  const stub: Pick<Geolocation, "getCurrentPosition"> = {
    getCurrentPosition(success, failure) {
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
  };
}
