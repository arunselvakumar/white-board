"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";

import {
  deletePushSubscription,
  notificationPreferencesQuery,
  pushConfigQuery,
  savePushSubscription,
  useUpdateNotificationPreferences,
} from "@/components/notifications/notification-queries";

import {
  browserPushDevice,
  PushPermissionError,
  type PushDevice,
} from "./push-device";
import { PushMenuListSkeleton } from "./profile-skeletons";

const DEVICE_KEY = ["messaging", "push-device"] as const;
const DEVICE_SWITCH_ID = "push-this-device";

type DeviceState =
  | "loading"
  | "unsupported"
  | "not-configured"
  | "unavailable"
  | "blocked"
  | "off"
  | "on";

const DEVICE_HINT: Record<DeviceState, string> = {
  loading: "Checking this device…",
  unsupported:
    "This browser can’t show notifications. On an iPhone, add the app to your Home Screen first.",
  "not-configured":
    "Notifications on devices aren’t set up for this app yet. You still see everything under the bell.",
  unavailable: "Couldn’t check this device. Please try again later.",
  blocked:
    "Your browser blocks notifications for this site. Allow them in the browser’s site settings, then come back here.",
  off: "Get a notification on this device, even when the app is closed.",
  on: "This device gets your notifications.",
};

/**
 * My Profile → Notifications (CM-904): turn on push on this browser, and
 * mute push per menu group. In-app notifications are never muted; the
 * Notification flag is the Company's switch. `device` is the browser's push
 * APIs; stories pass a fake.
 */
export function NotificationSettings({
  device = browserPushDevice,
}: {
  device?: PushDevice;
}) {
  return (
    <section aria-labelledby="my-notifications-heading" className="space-y-6">
      <div className="space-y-1">
        <h2 id="my-notifications-heading" className="text-base font-semibold">
          Notifications
        </h2>
        <p className="text-muted-foreground text-sm">
          Everything shows under the bell. Choose what also reaches your
          devices.
        </p>
      </div>
      <DeviceSwitch device={device} />
      <MutedGroups />
    </section>
  );
}

function DeviceSwitch({ device }: { device: PushDevice }) {
  const client = useQueryClient();
  const supported = device.isSupported();
  const config = useQuery({
    ...pushConfigQuery,
    enabled: supported,
    retry: false,
  });
  const publicKey = config.data?.publicKey ?? null;
  // A subscription this browser still holds is sent again, so a device
  // signed out elsewhere (which deletes it on the server) keeps getting push.
  const current = useQuery({
    queryKey: DEVICE_KEY,
    enabled: supported && publicKey != null,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const subscription = await device.current();
      if (subscription == null) return null;
      await savePushSubscription(subscription).catch(() => undefined);
      return subscription.endpoint;
    },
  });
  const toggle = useMutation({
    mutationFn: async (on: boolean): Promise<string | null> => {
      if (on) {
        if (publicKey == null) throw new Error("Push is not set up.");
        const subscription = await device.subscribe(publicKey);
        try {
          await savePushSubscription(subscription);
        } catch (error) {
          await device.unsubscribe().catch(() => null);
          throw error;
        }
        return subscription.endpoint;
      }
      const endpoint = await device.unsubscribe();
      if (endpoint != null) await deletePushSubscription(endpoint);
      return null;
    },
    onSuccess: (endpoint) => {
      client.setQueryData(DEVICE_KEY, endpoint);
    },
  });

  const state: DeviceState = !supported
    ? "unsupported"
    : config.isPending
      ? "loading"
      : config.isError
        ? "unavailable"
        : publicKey == null
          ? "not-configured"
          : device.permission() === "denied"
            ? "blocked"
            : current.isPending
              ? "loading"
              : current.data != null
                ? "on"
                : "off";
  const usable = state === "on" || state === "off";
  const failure = toggle.error;
  const message =
    failure == null
      ? null
      : failure instanceof PushPermissionError
        ? failure.permission === "denied"
          ? null
          : "Notifications stay off until you allow them in the browser’s prompt."
        : toggle.variables
          ? "Couldn’t turn on notifications on this device. Please try again."
          : "Couldn’t turn off notifications on this device. Please try again.";

  return (
    <div className="space-y-2">
      <div className="bg-card flex items-start justify-between gap-4 rounded-xl border p-4">
        <div className="min-w-0 space-y-1">
          <Label htmlFor={DEVICE_SWITCH_ID}>
            Turn on notifications on this device
          </Label>
          <p
            id={`${DEVICE_SWITCH_ID}-hint`}
            data-state={state}
            className="text-muted-foreground text-sm"
          >
            {DEVICE_HINT[state]}
          </p>
        </div>
        <Switch
          id={DEVICE_SWITCH_ID}
          aria-describedby={`${DEVICE_SWITCH_ID}-hint`}
          checked={state === "on"}
          disabled={!usable || toggle.isPending}
          onCheckedChange={(on) => {
            toggle.mutate(on);
          }}
        />
      </div>
      {message == null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {message}
        </p>
      )}
    </div>
  );
}

function MutedGroups() {
  const preferences = useQuery({
    ...notificationPreferencesQuery,
    retry: false,
  });
  const update = useUpdateNotificationPreferences();

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-sm font-medium">Push by menu</legend>
      <p className="text-muted-foreground text-sm">
        A muted menu still shows under the bell, but sends nothing to your
        devices.
      </p>
      {preferences.isPending ? (
        <PushMenuListSkeleton />
      ) : preferences.isError ? (
        <p role="alert" className="text-destructive text-sm">
          Couldn’t load your notification settings. Please try again.
        </p>
      ) : (
        <ul
          className="bg-card divide-y rounded-xl border"
          aria-label="Push by menu"
        >
          {preferences.data.groups.map((group) => {
            const id = `push-group-${group.key}`;
            return (
              <li
                key={group.key}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <Label htmlFor={id} className="min-w-0 font-normal">
                  {group.label}
                </Label>
                <Switch
                  id={id}
                  checked={!group.muted}
                  disabled={update.isPending}
                  onCheckedChange={(on) => {
                    const muted = preferences.data.groups
                      .filter((other) =>
                        other.key === group.key ? !on : other.muted,
                      )
                      .map((other) => other.key);
                    update.mutate(muted);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
      {update.isError ? (
        <p role="alert" className="text-destructive text-sm">
          Couldn’t save your choice. Please try again.
        </p>
      ) : null}
    </fieldset>
  );
}
