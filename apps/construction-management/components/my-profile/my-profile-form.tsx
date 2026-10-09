"use client";

import { formatMobile, normalizeMobile } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Separator } from "@repo/ui/components/separator";
import { Textarea } from "@repo/ui/components/textarea";

import { initials } from "@/components/app-shell/user-menu";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MobileField } from "@/components/auth/mobile-field";
import { ImageUploader } from "@/components/profile/image-uploader";
import { fieldForCode } from "@/lib/server-errors";
import {
  myProfileQuery,
  removeMyPhoto,
  revealMyIdentifiers,
  updateMyProfile,
  uploadMyPhoto,
  type MyProfileModel,
} from "@/src/queries/my-profile";
import { isValidAadhaar, isValidPan } from "@/src/shared-kernel/tax-ids";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name")
    .max(100, "Use at most 100 characters"),
  mobile: z
    .string()
    .trim()
    .refine((value) => value === "" || normalizeMobile(value) != null, {
      message: "Enter a valid 10-digit mobile number",
    }),
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      message: "Enter a valid email address",
    }),
  address: z.string().trim().max(500, "Use at most 500 characters"),
  emergencyContact: z.string().trim().max(120, "Use at most 120 characters"),
  aadhaar: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidAadhaar(value), {
      message: "Enter a valid 12-digit Aadhaar number",
    }),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || isValidPan(value), {
      message: "Enter a valid 10-character PAN, like ABCPE1234F",
    }),
});

type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  MEMBER_NAME_REQUIRED: "name",
  MEMBER_NAME_TOO_LONG: "name",
  MOBILE_INVALID: "mobile",
  MEMBER_MOBILE_IN_USE: "mobile",
  EMAIL_INVALID: "email",
  MEMBER_EMAIL_IN_USE: "email",
  MOBILE_OR_EMAIL_REQUIRED: "email",
  ADDRESS_TOO_LONG: "address",
  EMERGENCY_CONTACT_TOO_LONG: "emergencyContact",
  AADHAAR_INVALID: "aadhaar",
  PAN_INVALID: "pan",
};

function valuesOf(profile: MyProfileModel): Values {
  return {
    name: profile.name,
    // Only an editable mobile is a form value (SMS off, ADR CM-0009).
    mobile: profile.mobileEditable
      ? (profile.mobile?.replace(/^\+91/, "") ?? "")
      : "",
    email: profile.email ?? "",
    address: profile.address ?? "",
    emergencyContact: profile.emergencyContact ?? "",
    aadhaar: "",
    pan: "",
  };
}

type Identifier = "aadhaar" | "pan";

const IDENTIFIERS: readonly {
  key: Identifier;
  label: string;
  masked: (profile: MyProfileModel) => string | null;
  placeholder: string;
}[] = [
  {
    key: "aadhaar",
    label: "Aadhaar",
    masked: (profile) => profile.aadhaarMasked,
    placeholder: "2341 2341 2346",
  },
  {
    key: "pan",
    label: "PAN",
    masked: (profile) => profile.panMasked,
    placeholder: "ABCPE1234F",
  },
];

/**
 * My Profile (CM-115): the signed-in User's own Team Member record in the
 * Active Company. While SMS is off (ADR CM-0009) the mobile is a contact
 * they may change; while it is on it is how they sign in, so it is shown,
 * not edited.
 */
export function MyProfileForm({ profile }: { profile: MyProfileModel }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<Record<Identifier, boolean>>({
    aadhaar: false,
    pan: false,
  });
  const [revealed, setRevealed] = useState<Record<
    Identifier,
    string | null
  > | null>(null);
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(profile),
  });
  const mutation = useMutation({ mutationFn: updateMyProfile });
  const reveal = useMutation({ mutationFn: revealMyIdentifiers });
  const errors = form.formState.errors;

  const accept = (updated: MyProfileModel) => {
    queryClient.setQueryData(myProfileQuery.queryKey, updated);
  };

  const submit = async (values: Parsed) => {
    setSaved(false);
    try {
      const updated = await mutation.mutateAsync({
        name: values.name,
        ...(profile.mobileEditable
          ? {
              mobile:
                values.mobile === "" ? null : normalizeMobile(values.mobile),
            }
          : {}),
        email: values.email === "" ? null : values.email,
        address: values.address === "" ? null : values.address,
        emergencyContact:
          values.emergencyContact === "" ? null : values.emergencyContact,
        // Left blank, an id stays as it is.
        ...(editing.aadhaar && values.aadhaar !== ""
          ? { aadhaar: values.aadhaar }
          : {}),
        ...(editing.pan && values.pan !== "" ? { pan: values.pan } : {}),
      });
      accept(updated);
      form.reset(valuesOf(updated));
      setEditing({ aadhaar: false, pan: false });
      setRevealed(null);
      setSaved(true);
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  const hasIdentifiers =
    profile.aadhaarMasked != null || profile.panMasked != null;

  return (
    <div className="space-y-8">
      <section aria-labelledby="my-photo-heading" className="space-y-3">
        <div>
          <h2 id="my-photo-heading" className="text-base font-semibold">
            Photo
          </h2>
          <p className="text-muted-foreground text-sm">
            Shown on your account menu and to your team.
          </p>
        </div>
        <ImageUploader
          kind="member_photo"
          noun="photo"
          shape="circle"
          imageUrl={profile.photoUrl}
          fallback={initials(profile.name) || "?"}
          hint="PNG, JPEG or WebP, up to 10 MB."
          onUpload={async (file) => {
            accept(await uploadMyPhoto(file));
          }}
          onRemove={async () => {
            accept(await removeMyPhoto());
          }}
        />
      </section>

      <Separator />

      <form
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
        noValidate
        aria-label="My Profile"
        className="space-y-8"
      >
        <section aria-labelledby="my-contact-heading" className="space-y-4">
          <h2 id="my-contact-heading" className="text-base font-semibold">
            Contact
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="my-name">Name</Label>
              <Input id="my-name" className="h-10" {...form.register("name")} />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="my-mobile">Mobile</Label>
              {profile.mobileEditable ? (
                <>
                  <MobileField id="my-mobile" {...form.register("mobile")} />
                  <FieldError message={errors.mobile?.message} />
                </>
              ) : (
                <>
                  <Input
                    id="my-mobile"
                    readOnly
                    disabled
                    className="h-10"
                    value={
                      profile.mobile == null
                        ? "Not added"
                        : formatMobile(profile.mobile)
                    }
                    aria-describedby="my-mobile-note"
                  />
                  <p
                    id="my-mobile-note"
                    className="text-muted-foreground text-xs"
                  >
                    This is how you sign in, so it cannot be changed here.
                  </p>
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="my-email">Email</Label>
              <Input
                id="my-email"
                type="email"
                placeholder="you@example.com"
                className="h-10"
                {...form.register("email")}
              />
              <FieldError message={errors.email?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="my-emergency-contact">Emergency contact</Label>
              <Input
                id="my-emergency-contact"
                placeholder="Name and mobile"
                className="h-10"
                {...form.register("emergencyContact")}
              />
              <FieldError message={errors.emergencyContact?.message} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="my-address">Address</Label>
              <Textarea
                id="my-address"
                rows={3}
                {...form.register("address")}
              />
              <FieldError message={errors.address?.message} />
            </div>
          </div>
        </section>

        <section aria-labelledby="my-ids-heading" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="my-ids-heading" className="text-base font-semibold">
                Identity numbers
              </h2>
              <p className="text-muted-foreground text-sm">
                Stored encrypted and shown masked. Each reveal is recorded.
              </p>
            </div>
            {hasIdentifiers &&
              (revealed == null ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={reveal.isPending}
                  onClick={() => {
                    reveal.mutate(undefined, {
                      onSuccess: (values) => {
                        setRevealed(values);
                      },
                    });
                  }}
                >
                  <Eye />
                  {reveal.isPending ? "Revealing…" : "Reveal"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRevealed(null);
                  }}
                >
                  <EyeOff />
                  Hide
                </Button>
              ))}
          </div>
          <FormAlert
            message={
              reveal.error == null
                ? undefined
                : fieldForCode(reveal.error, {}).message
            }
          />
          <dl className="grid gap-4 md:grid-cols-2">
            {IDENTIFIERS.map((identifier) => {
              const masked = identifier.masked(profile);
              const shown = revealed?.[identifier.key] ?? masked;
              const inputId = `my-${identifier.key}`;
              return (
                <div key={identifier.key} className="space-y-1.5">
                  <dt className="text-sm font-medium">{identifier.label}</dt>
                  <dd className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-sm ${shown == null ? "text-muted-foreground font-sans" : ""}`}
                      >
                        {shown ?? "Not added"}
                      </span>
                      {!editing[identifier.key] && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing({ ...editing, [identifier.key]: true });
                          }}
                        >
                          <Pencil />
                          {masked == null
                            ? `Add ${identifier.label}`
                            : `Change ${identifier.label}`}
                        </Button>
                      )}
                    </div>
                    {editing[identifier.key] && (
                      <div className="space-y-1.5">
                        <Label htmlFor={inputId} className="sr-only">
                          {`New ${identifier.label}`}
                        </Label>
                        <Input
                          id={inputId}
                          autoComplete="off"
                          placeholder={identifier.placeholder}
                          className="h-10 uppercase placeholder:normal-case"
                          {...form.register(identifier.key)}
                        />
                        <FieldError message={errors[identifier.key]?.message} />
                      </div>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>

        <FormAlert message={errors.root?.message} />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="h-10" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
          {saved && !form.formState.isDirty && (
            <p role="status" className="text-muted-foreground text-sm">
              Your profile is saved.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
