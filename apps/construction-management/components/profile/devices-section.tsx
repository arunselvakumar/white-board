"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { BellRing, Monitor, Smartphone, Tablet } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  accountQueries,
  signOutDevice,
  signOutOtherDevices,
  type DeviceItem,
} from "@/src/queries/account";

const KIND_ICONS = { phone: Smartphone, tablet: Tablet, desktop: Monitor };

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function deviceName(device: DeviceItem): string {
  return `${device.browser} on ${device.os}`;
}

type Confirm = { kind: "one"; device: DeviceItem } | { kind: "others" };

/**
 * My Profile → Devices (CM-907, ADR CM-0021 §9): where the User is signed
 * in, this device first. Signing a device out also stops its push
 * notifications.
 */
export function DevicesSection() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(accountQueries.devices());
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const done = async (message: string) => {
    setNotice(message);
    await queryClient.invalidateQueries({
      queryKey: accountQueries.key.devices,
    });
  };
  const one = useMutation({
    mutationFn: (device: DeviceItem) => signOutDevice(device.id),
    onSuccess: (_, device) => done(`${deviceName(device)} is signed out.`),
  });
  const others = useMutation({
    mutationFn: signOutOtherDevices,
    onSuccess: ({ signedOut }) =>
      done(
        `${String(signedOut)} other ${signedOut === 1 ? "device is" : "devices are"} signed out.`,
      ),
  });
  const error = one.error ?? others.error;
  const otherCount = data.items.filter((item) => !item.isCurrent).length;

  return (
    <section aria-labelledby="devices-heading" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="devices-heading" className="text-lg font-semibold">
            Devices
          </h2>
          <p className="text-muted-foreground text-sm">
            Where you are signed in. Sign out of a device you do not recognise.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={otherCount === 0 || others.isPending}
          onClick={() => {
            setConfirm({ kind: "others" });
          }}
        >
          Sign out of all other devices
        </Button>
      </div>

      <ItemGroup className="gap-2">
        {data.items.map((device) => {
          const Icon = KIND_ICONS[device.kind];
          return (
            <Item
              key={device.id}
              variant="outline"
              role="listitem"
              aria-label={deviceName(device)}
              className="bg-card flex-wrap"
            >
              <ItemMedia variant="icon">
                <Icon />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="flex flex-wrap items-center gap-2">
                  {deviceName(device)}
                  {device.isCurrent && <Badge>This device</Badge>}
                  {device.pushOn && (
                    <Badge variant="secondary">
                      <BellRing aria-hidden="true" />
                      Push on
                    </Badge>
                  )}
                </ItemTitle>
                <ItemDescription>
                  Signed in {when(device.signedInAt)} · Last active{" "}
                  {when(device.lastActiveAt)}
                </ItemDescription>
              </ItemContent>
              {!device.isCurrent && (
                <ItemActions>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={one.isPending}
                    onClick={() => {
                      setConfirm({ kind: "one", device });
                    }}
                  >
                    Sign out
                  </Button>
                </ItemActions>
              )}
            </Item>
          );
        })}
      </ItemGroup>
      {otherCount === 0 && (
        <p className="text-muted-foreground text-sm">
          You are not signed in anywhere else.
        </p>
      )}
      {notice != null && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <FormAlert
        message={error == null ? undefined : fieldForCode(error, {}).message}
      />

      <AlertDialog
        open={confirm != null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "one"
                ? `Sign out of ${deviceName(confirm.device)}?`
                : "Sign out of all other devices?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "one"
                ? "That device will need to sign in again, and stops getting notifications."
                : "Every device except this one will need to sign in again, and stops getting notifications."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = confirm;
                setConfirm(null);
                setNotice(null);
                if (target?.kind === "one") one.mutate(target.device);
                else if (target?.kind === "others") others.mutate();
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
