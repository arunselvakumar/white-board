import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, fn, waitFor, within } from "storybook/test";

import {
  CHECK_INS_PATH,
  type CheckInPerson,
  type CheckInPersonView,
  type RecordCheckInResult,
} from "@/src/queries/check-ins";

import { mockApi, StoryQueries, type ApiCall } from "@/.storybook/mocks/api";
import { mockGeolocation } from "@/.storybook/mocks/geolocation";
import {
  DHURESH,
  entry,
  MURUGAN,
  MURUGAN_IN,
  NOW,
  personView,
  PROJECT_ID,
  RAVI,
  STILL_JPEG_BASE64,
} from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-fixtures";
import { CAMERA_MESSAGES } from "./capture-camera-panel";
import { CheckInCaptureScreen, PRIVACY_LINE } from "./check-in-capture-screen";
import { fakeCamera, type FakeCameraEvent } from "./fake-camera";
import { CameraContext, type Camera } from "./use-camera";

const FIND = `/app/projects/${PROJECT_ID}/attendance/check-in`;
const POSITION = { latitude: 8.1833, longitude: 77.4119, accuracy: 12 };

let calls: ApiCall[] = [];
const cameraEvents = fn<(event: FakeCameraEvent) => void>();

function posted(): unknown[] {
  return calls
    .filter((call) => call.method === "POST" && call.path === CHECK_INS_PATH)
    .map((call) => call.body);
}

function personPath(who: CheckInPerson): string {
  return `${CHECK_INS_PATH}/person?${new URLSearchParams({
    projectId: PROJECT_ID,
    kind: who.kind,
    personId: who.id,
  })}`;
}

/** What the server answers to a recorded entry of `who`. */
function recorded(
  who: CheckInPerson,
  overrides: Partial<RecordCheckInResult> = {},
): RecordCheckInResult {
  const saved = entry(who, { action: "check_in", at: NOW });
  return {
    entry: saved,
    repeated: false,
    person: { ...who, state: { status: "in", since: NOW } },
    day:
      who.kind === "labour"
        ? {
            effect: "created",
            status: "present",
            checkIn: "14:00",
            checkOut: null,
            breakMinutes: null,
            note: null,
          }
        : null,
    ...overrides,
  };
}

/**
 * Serves the person (the next view after each POST), answers POSTs with
 * `post`, and puts the device at the site unless told otherwise.
 */
function serve(
  views: CheckInPersonView[],
  options: {
    post?: (call: ApiCall) => Response;
    geolocation?: Parameters<typeof mockGeolocation>[0];
    /** What the browser says about the location before anyone is asked. */
    permission?: PermissionState;
  } = {},
) {
  return () => {
    calls = [];
    cameraEvents.mockClear();
    let index = 0;
    const first = views[0];
    const restoreGeo = mockGeolocation(
      options.geolocation ?? POSITION,
      options.permission == null ? {} : { permission: options.permission },
    );
    const api = mockApi((call) => {
      calls.push(call);
      if (
        call.method === "GET" &&
        first != null &&
        call.path === personPath(first.person)
      )
        return Response.json(views[Math.min(index, views.length - 1)]);
      if (call.method === "POST" && call.path === CHECK_INS_PATH) {
        index += 1;
        return (
          options.post?.(call) ??
          Response.json(recorded(first?.person ?? DHURESH), { status: 201 })
        );
      }
      return undefined;
    });
    return () => {
      api.restore();
      restoreGeo();
    };
  };
}

const meta = {
  title: "Attendance/Check-In/Capture",
  component: CheckInCaptureScreen,
  args: { projectId: PROJECT_ID, kind: "labour", personId: DHURESH.id },
  beforeEach: serve([personView(DHURESH)]),
  parameters: {
    camera: fakeCamera({ onEvent: cameraEvents }),
    searchParams: "q=dhu",
  },
  render: (args, context) => (
    <StoryQueries>
      <CameraContext value={context.parameters["camera"] as () => Camera}>
        <CheckInCaptureScreen {...args} />
      </CameraContext>
    </StoryQueries>
  ),
} satisfies Meta<typeof CheckInCaptureScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

type Context = Parameters<NonNullable<Story["play"]>>[0];

/** The screen is portaled to `<body>`, over everything. */
function screen({ canvasElement }: Context) {
  return within(canvasElement.ownerDocument.body);
}

async function opened(context: Context, name: string) {
  const body = screen(context);
  await body.findByRole("heading", { level: 1, name });
  return body;
}

/**
 * Not in yet: the camera is live, the clock runs on the server's time, the
 * action defaults to Check In, and the location says what it will be
 * checked against.
 */
export const LiveCheckIn: Story = {
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await expect(
      body.getByRole("dialog", { name: "Dhuresh Nawin" }),
    ).toBeVisible();
    // The page behind the screen takes no focus and no clicks.
    await expect(context.canvasElement.closest("[inert]")).not.toBeNull();
    await expect(
      body.getByText("Carpenter · L-0051 · +91 77088 99001"),
    ).toBeVisible();
    const clock = body.getByRole("timer", { name: "Time now" });
    await expect(clock).toHaveTextContent(/^2:00:\d\d pm/);
    await expect(clock).toHaveTextContent("Saturday, 14 Nov 2026");
    await expect(
      body.getByRole("combobox", { name: "Entry" }),
    ).toHaveTextContent("Check In");
    await expect(body.getByText("Not checked in today")).toBeVisible();
    await expect(
      await body.findByText(
        "Location found (± 12 m). It will be checked against Kumari Heights site.",
      ),
    ).toBeVisible();
    await expect(body.getByText(PRIVACY_LINE)).toBeVisible();
    await expect(body.getByText("No entries yet today.")).toBeVisible();
    await expect(body.getByRole("button", { name: "Check In" })).toBeEnabled();
    await expect(
      body.getByRole("button", { name: "Switch camera" }),
    ).toBeVisible();
    // Back keeps the search typed on the find screen.
    await expect(body.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      `${FIND}?q=dhu`,
    );
  },
};

/** Switch camera turns to the front one, mirrored on screen only. */
export const SwitchToFrontCamera: Story = {
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    const video = body.getByLabelText("Camera");
    await expect(video).not.toHaveClass("-scale-x-100");
    await context.userEvent.click(
      body.getByRole("button", { name: "Switch camera" }),
    );
    await waitFor(() => expect(video).toHaveClass("-scale-x-100"));
    await expect(cameraEvents).toHaveBeenCalledWith("switch");
  },
};

/** Off until turned on: submitting needs the live picture. */
export const CameraIdle: Story = {
  parameters: {
    camera: fakeCamera({ initial: "idle", onEvent: cameraEvents }),
  },
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await expect(body.getByRole("button", { name: "Check In" })).toBeDisabled();
    await context.userEvent.click(
      body.getByRole("button", { name: "Turn on camera" }),
    );
    await expect(cameraEvents).toHaveBeenCalledWith("start");
    await expect(body.getByRole("button", { name: "Check In" })).toBeEnabled();
  },
};

/** Permission refused: one sentence and Try again; still no submitting. */
export const CameraDenied: Story = {
  parameters: {
    camera: fakeCamera({
      initial: "denied",
      onStart: "denied",
      onEvent: cameraEvents,
    }),
  },
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await expect(body.getByText(CAMERA_MESSAGES.denied)).toBeVisible();
    await expect(body.getByRole("button", { name: "Check In" })).toBeDisabled();
    await context.userEvent.click(
      body.getByRole("button", { name: "Try again" }),
    );
    await expect(cameraEvents).toHaveBeenCalledWith("start");
    await expect(body.getByText(CAMERA_MESSAGES.denied)).toBeVisible();
  },
};

/** No camera on the device. */
export const CameraUnavailable: Story = {
  parameters: {
    camera: fakeCamera({
      initial: "unavailable",
      onStart: "unavailable",
      canSwitch: false,
    }),
  },
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await expect(body.getByText(CAMERA_MESSAGES.unavailable)).toBeVisible();
    await expect(body.getByRole("button", { name: "Check In" })).toBeDisabled();
    await expect(
      body.queryByRole("button", { name: "Switch camera" }),
    ).toBeNull();
  },
};

/** Still looking for the location: it never holds the entry back. */
export const LocationFinding: Story = {
  beforeEach: serve([personView(DHURESH)], { geolocation: "pending" }),
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await expect(
      body.getByText("Finding this device's location…"),
    ).toBeVisible();
    await expect(body.getByRole("button", { name: "Check In" })).toBeEnabled();
  },
};

/**
 * A browser that would have to ask is not asked on arrival: the line offers
 * Use location, and one tap finds it.
 */
export const LocationNotAskedYet: Story = {
  beforeEach: serve([personView(DHURESH)], { permission: "prompt" }),
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await expect(body.getByText("The location is not on yet.")).toBeVisible();
    await expect(body.getByRole("button", { name: "Check In" })).toBeEnabled();
    await context.userEvent.click(
      body.getByRole("button", { name: "Use location" }),
    );
    await expect(await body.findByText(/^Location found/)).toBeVisible();
  },
};

/** Turn on camera is the first tap: the location is asked for with it. */
export const TurnOnCameraAsksLocation: Story = {
  parameters: {
    camera: fakeCamera({ initial: "idle", onEvent: cameraEvents }),
  },
  beforeEach: serve([personView(DHURESH)], { permission: "prompt" }),
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await expect(body.getByText("The location is not on yet.")).toBeVisible();
    await context.userEvent.click(
      body.getByRole("button", { name: "Turn on camera" }),
    );
    await expect(await body.findByText(/^Location found/)).toBeVisible();
    await expect(body.getByRole("button", { name: "Check In" })).toBeEnabled();
  },
};

/** Location refused: the reason and Try again; the entry goes without one. */
export const LocationRefused: Story = {
  beforeEach: serve([personView(DHURESH)], { geolocation: { code: 1 } }),
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await expect(
      await body.findByText(/^No location\. Location permission is off/),
    ).toBeVisible();
    await expect(body.getByRole("button", { name: "Try again" })).toBeVisible();
    await context.userEvent.click(
      body.getByRole("button", { name: "Check In" }),
    );
    await body.findByText("Checked in at 2:00 pm");
    await expect(posted()).toEqual([
      {
        projectId: PROJECT_ID,
        kind: "labour",
        personId: DHURESH.id,
        action: "check_in",
        photo: STILL_JPEG_BASE64,
        location: null,
      },
    ]);
  },
};

/** In since 10:02 am: the action defaults to Check Out, today lists the entry. */
export const DefaultCheckOut: Story = {
  args: { personId: MURUGAN.id },
  beforeEach: serve([personView(MURUGAN, [MURUGAN_IN])]),
  play: async (context) => {
    const body = await opened(context, "Murugan Ganesan");
    await expect(
      body.getByRole("combobox", { name: "Entry" }),
    ).toHaveTextContent("Check Out");
    await expect(body.getByText("In since 10:02 am")).toBeVisible();
    const today = within(body.getByRole("list", { name: "Today's entries" }));
    await expect(today.getByText("Check In 10:02 am")).toBeVisible();
    await expect(today.getByText("Inside the site fence")).toBeVisible();
    await expect(body.getByRole("button", { name: "Check Out" })).toBeEnabled();
    // The operator may still choose Check In.
    await context.userEvent.click(
      body.getByRole("combobox", { name: "Entry" }),
    );
    await context.userEvent.click(
      await body.findByRole("option", { name: "Check In" }),
    );
    await waitFor(() => expect(body.queryByRole("listbox")).toBeNull());
    await expect(body.getByRole("button", { name: "Check In" })).toBeEnabled();
  },
};

/** While it sends: the picture freezes on the frame taken, the button waits. */
export const Submitting: Story = {
  beforeEach: () => {
    const restoreGeo = mockGeolocation(POSITION);
    const original = globalThis.fetch;
    const api = mockApi((call) =>
      call.method === "GET" && call.path === personPath(DHURESH)
        ? Response.json(personView(DHURESH))
        : undefined,
    );
    const served = globalThis.fetch;
    globalThis.fetch = (input, init) =>
      (init?.method ?? "GET") === "POST"
        ? new Promise<Response>(() => undefined)
        : served(input, init);
    return () => {
      globalThis.fetch = original;
      api.restore();
      restoreGeo();
    };
  },
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await context.userEvent.click(
      body.getByRole("button", { name: "Check In" }),
    );
    await expect(
      await body.findByRole("button", { name: "Checking in…" }),
    ).toBeDisabled();
    await expect(
      body.getByRole("img", { name: "The frame taken" }),
    ).toBeVisible();
    await expect(body.getByRole("combobox", { name: "Entry" })).toBeDisabled();
  },
};

/**
 * Recorded: the confirmation shows the photo, the time from the saved
 * entry, the name and the fence result; the camera is released, and a tap
 * goes back to an empty search.
 */
export const Confirmation: Story = {
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await body.findByText(/^Location found/);
    await context.userEvent.click(
      body.getByRole("button", { name: "Check In" }),
    );
    await expect(await body.findByText("Checked in at 2:00 pm")).toBeVisible();
    await expect(body.getByText("Inside the site fence")).toBeVisible();
    await expect(
      body.getByRole("img", { name: "Dhuresh Nawin" }),
    ).toBeVisible();
    await expect(cameraEvents).toHaveBeenCalledWith("stop");
    await expect(posted()).toEqual([
      {
        projectId: PROJECT_ID,
        kind: "labour",
        personId: DHURESH.id,
        action: "check_in",
        photo: STILL_JPEG_BASE64,
        location: { latitude: 8.1833, longitude: 77.4119, accuracyMetres: 12 },
      },
    ]);
    await context.userEvent.click(
      body.getByRole("button", { name: "Done, back to the search" }),
    );
    await expect(getRouter().replace).toHaveBeenLastCalledWith(FIND);
  },
};

/** A Labour whose day the sheet already has: the server's note is shown. */
export const ConfirmationWithNote: Story = {
  beforeEach: serve([personView(DHURESH)], {
    post: () =>
      Response.json(
        recorded(DHURESH, {
          day: {
            effect: "kept",
            status: "present",
            checkIn: "09:00",
            checkOut: null,
            breakMinutes: 60,
            note: "The times typed on the attendance sheet were kept.",
          },
        }),
        { status: 201 },
      ),
  }),
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await context.userEvent.click(
      body.getByRole("button", { name: "Check In" }),
    );
    await expect(await body.findByText("Checked in at 2:00 pm")).toBeVisible();
    await expect(
      body.getByText("The times typed on the attendance sheet were kept."),
    ).toBeVisible();
  },
};

/** A second tap within two minutes: the entry already there is shown. */
export const RepeatedEntry: Story = {
  beforeEach: serve([personView(DHURESH)], {
    post: () =>
      Response.json(
        recorded(DHURESH, {
          repeated: true,
          entry: entry(DHURESH, {
            action: "check_in",
            at: "2026-11-14T08:29:10.000Z",
          }),
        }),
      ),
  }),
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await context.userEvent.click(
      body.getByRole("button", { name: "Check In" }),
    );
    const title = await body.findByText("Already recorded at 1:59 pm");
    await expect(title).toBeVisible();
    // Nothing was saved this time, so the photo is the earlier entry's.
    await expect(
      title.closest('[role="status"]')?.querySelector("img"),
    ).toHaveAttribute(
      "src",
      expect.stringMatching(/\/check-ins\/[^/]+\/photo$/),
    );
  },
};

/**
 * Already checked in on another device: the server's words stay on the
 * screen, the person is read again, and the action follows to Check Out.
 */
export const AlreadyCheckedIn: Story = {
  beforeEach: serve(
    [
      personView(DHURESH),
      personView(
        {
          ...DHURESH,
          state: { status: "in", since: "2026-11-14T08:10:00.000Z" },
        },
        [
          entry(DHURESH, {
            action: "check_in",
            at: "2026-11-14T08:10:00.000Z",
          }),
        ],
      ),
    ],
    {
      post: () =>
        Response.json(
          {
            code: "ALREADY_CHECKED_IN",
            message: "They are already checked in. Check them out first.",
          },
          { status: 409 },
        ),
    },
  ),
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await context.userEvent.click(
      body.getByRole("button", { name: "Check In" }),
    );
    await expect(await body.findByRole("alert")).toHaveTextContent(
      "They are already checked in. Check them out first.",
    );
    await expect(await body.findByText("In since 1:40 pm")).toBeVisible();
    await expect(
      body.getByRole("combobox", { name: "Entry" }),
    ).toHaveTextContent("Check Out");
    await expect(body.getByRole("button", { name: "Check Out" })).toBeEnabled();
    // The live picture is back for the next photo.
    await expect(
      body.queryByRole("img", { name: "The frame taken" }),
    ).toBeNull();
  },
};

/**
 * No signal: the frame is kept and Try again sends the same photo, which
 * then goes through.
 */
export const NetworkFailure: Story = {
  beforeEach: serve([personView(DHURESH)], {
    post: (() => {
      let attempts = 0;
      return () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("Failed to fetch");
        return Response.json(recorded(DHURESH), { status: 201 });
      };
    })(),
  }),
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await context.userEvent.click(
      body.getByRole("button", { name: "Check In" }),
    );
    await expect(
      await body.findByText("Could not reach the server"),
    ).toBeVisible();
    await expect(
      body.getByRole("img", { name: "The frame taken" }),
    ).toBeVisible();
    await context.userEvent.click(
      body.getByRole("button", { name: "Try again" }),
    );
    await expect(await body.findByText("Checked in at 2:00 pm")).toBeVisible();
    const [first, second] = posted();
    await expect(second).toEqual(first);
    await expect(
      cameraEvents.mock.calls.filter(([event]) => event === "capture"),
    ).toHaveLength(1);
  },
};

/** A Site Engineer, from `site-engineer` in the address. */
export const SiteEngineer: Story = {
  args: { kind: "site_engineer", personId: RAVI.id },
  beforeEach: serve([personView(RAVI)]),
  play: async (context) => {
    const body = await opened(context, "Ravi Shankar");
    await expect(body.getByText("In since 9:15 am")).toBeVisible();
  },
};

/** Escape goes back to the search. */
export const EscapeGoesBack: Story = {
  play: async (context) => {
    await opened(context, "Dhuresh Nawin");
    await context.userEvent.keyboard("{Escape}");
    await expect(getRouter().replace).toHaveBeenLastCalledWith(`${FIND}?q=dhu`);
  },
};

/** 375 px: stacked, no sideways scroll, the button held at the bottom. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    const dialog = body.getByRole("dialog", { name: "Dhuresh Nawin" });
    await expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
    const button = body
      .getByRole("button", { name: "Check In" })
      .getBoundingClientRect();
    const view = context.canvasElement.ownerDocument.documentElement;
    await expect(button.bottom).toBeLessThanOrEqual(view.clientHeight);
    await expect(button.height).toBeGreaterThanOrEqual(48);
  },
};

/** The same in the dark theme. */
export const Dark: Story = {
  globals: { theme: "dark" },
  play: async (context) => {
    const body = await opened(context, "Dhuresh Nawin");
    await expect(body.getByRole("button", { name: "Check In" })).toBeVisible();
  },
};
