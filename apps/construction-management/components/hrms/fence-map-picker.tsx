"use client";

import { LocateFixed } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FieldError } from "@/components/auth/field-error";

import type { FenceMapProps } from "./fence-map";

const FenceMap = dynamic<FenceMapProps>(() => import("./fence-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full rounded-lg sm:h-72" />,
});

/** Parsed coordinates, or null while a field is blank or not a number. */
export function coordinate(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "" || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}

export type FencePickerValue = {
  latitude: string;
  longitude: string;
  radiusMetres: string;
};

/**
 * Where a fence is (CM-304): a map with a pin and the radius circle,
 * "Use my location", and typed latitude, longitude and radius. The typed
 * fields are the form's values; the map and the location button fill them
 * in. `showMap` is off in story tests, which have no map tiles.
 */
export function FenceMapPicker({
  value,
  onChange,
  errors,
  showMap = true,
}: {
  value: FencePickerValue;
  onChange: (next: Partial<FencePickerValue>) => void;
  errors: Partial<Record<keyof FencePickerValue, string>>;
  showMap?: boolean;
}) {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | undefined>();
  const latitude = coordinate(value.latitude);
  const longitude = coordinate(value.longitude);
  const radius = coordinate(value.radiusMetres);

  const useMyLocation = () => {
    setLocationError(undefined);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationError(
        "This browser cannot share its location. Type the latitude and longitude instead.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        });
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location is blocked for this site. Allow it in the browser, or type the latitude and longitude."
            : "Your location could not be found. Try again outside, or type the latitude and longitude.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Fence location</legend>
      {showMap ? (
        <FenceMap
          latitude={latitude}
          longitude={longitude}
          radiusMetres={radius}
          onPick={(point) => {
            onChange({
              latitude: point.latitude.toFixed(6),
              longitude: point.longitude.toFixed(6),
            });
          }}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locating}
          onClick={useMyLocation}
        >
          <LocateFixed aria-hidden="true" />
          {locating ? "Finding you…" : "Use my location"}
        </Button>
        <p className="text-muted-foreground text-xs">
          {showMap
            ? "Tap the map or drag the pin to the centre of the fence."
            : "Stand at the centre of the fence, or type its coordinates."}
        </p>
      </div>
      <p role="status" className="text-destructive text-sm">
        {locationError ?? ""}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="fence-latitude">Latitude</Label>
          <Input
            id="fence-latitude"
            inputMode="decimal"
            className="h-10"
            placeholder="13.082700"
            value={value.latitude}
            aria-invalid={errors.latitude != null}
            onChange={(event) => {
              onChange({ latitude: event.target.value });
            }}
          />
          <FieldError message={errors.latitude} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fence-longitude">Longitude</Label>
          <Input
            id="fence-longitude"
            inputMode="decimal"
            className="h-10"
            placeholder="80.270700"
            value={value.longitude}
            aria-invalid={errors.longitude != null}
            onChange={(event) => {
              onChange({ longitude: event.target.value });
            }}
          />
          <FieldError message={errors.longitude} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fence-radius">Radius</Label>
          <div className="flex items-center gap-2">
            <Input
              id="fence-radius"
              inputMode="numeric"
              className="h-10"
              value={value.radiusMetres}
              aria-describedby="fence-radius-hint"
              aria-invalid={errors.radiusMetres != null}
              onChange={(event) => {
                onChange({ radiusMetres: event.target.value });
              }}
            />
            <span className="text-muted-foreground text-sm">metres</span>
          </div>
          <p id="fence-radius-hint" className="text-muted-foreground text-xs">
            25 to 5,000 metres.
          </p>
          <FieldError message={errors.radiusMetres} />
        </div>
      </div>
    </fieldset>
  );
}
