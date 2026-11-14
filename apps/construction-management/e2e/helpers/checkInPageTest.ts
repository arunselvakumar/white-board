import { CheckInPage } from "../pages/CheckInPage";
import { projectTest } from "./projectTest";

/**
 * Check-In needs a camera. Chromium's fake device gives a moving test
 * picture and its fake UI answers the camera prompt with Allow; the
 * location is a fixed point in Coimbatore.
 */
export const checkInPageTest = projectTest.extend<{
  checkInPage: CheckInPage;
}>({
  launchOptions: async ({ launchOptions }, use) => {
    await use({
      ...launchOptions,
      args: [
        ...(launchOptions.args ?? []),
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    });
  },
  permissions: ["geolocation"],
  geolocation: { latitude: 11.0168, longitude: 76.9558, accuracy: 12 },
  checkInPage: async ({ page, project }, use) => {
    await use(new CheckInPage(page, project.id));
  },
});
