export type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracyMetres: number | null;
};

/** Why the device location could not be read, in words for the screen. */
export class LocationError extends Error {
  constructor(
    readonly reason: "unsupported" | "denied" | "timeout" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "LocationError";
  }
}

/**
 * The device's current location through `navigator.geolocation`, with a
 * clear message when permission is denied, it times out or the device
 * cannot tell.
 */
export function getDeviceLocation(timeoutMs = 15_000): Promise<DeviceLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(
        new LocationError(
          "unsupported",
          "This browser cannot share your location. Open the app in Chrome or Safari on your phone.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED)
          reject(
            new LocationError(
              "denied",
              "Location permission is off. Allow location for this site in your browser settings, then try again.",
            ),
          );
        else if (error.code === error.TIMEOUT)
          reject(
            new LocationError(
              "timeout",
              "Your location took too long to find. Step outside or near a window and try again.",
            ),
          );
        else
          reject(
            new LocationError(
              "unavailable",
              "Your phone could not find its location. Turn on location (GPS) and try again.",
            ),
          );
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
