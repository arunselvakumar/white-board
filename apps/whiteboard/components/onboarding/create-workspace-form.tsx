"use client";

import { useAuth, useWorkspaceList } from "@repo/auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Blocks,
  GraduationCap,
  Landmark,
  MonitorPlay,
  School,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { LoadingScreen } from "@/components/auth/loading-screen";
import {
  AVAILABLE_INSTITUTION_TYPE_VALUES,
  DEFAULT_INSTITUTION_TYPE,
  INSTITUTION_TYPES,
  isAvailableInstitutionType,
  type AvailableInstitutionType,
  type InstitutionType,
} from "@/lib/institution-type";
import { postWorkspacePath } from "@/lib/safe-redirect";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Workspace name is required")
    .max(100, "Workspace name must be 100 characters or fewer"),
  institutionType: z.enum(AVAILABLE_INSTITUTION_TYPE_VALUES, {
    error: "Select an institution type",
  }),
});

type FormValues = z.infer<typeof schema>;

const INSTITUTION_TYPE_ICONS: Record<InstitutionType, LucideIcon> = {
  training_institute: MonitorPlay,
  school: School,
  preschool: Blocks,
  college: GraduationCap,
  university: Landmark,
  other: Shapes,
};

const INSTITUTION_TYPE_TOOLTIPS: Record<InstitutionType, string> = {
  training_institute:
    "For computer education centres, home tuition, and skill training.",
  school: "For primary and secondary education. Coming soon.",
  preschool: "For early childhood education. Coming soon.",
  college: "For higher education colleges. Coming soon.",
  university: "For universities. Coming soon.",
  other: "For institutions outside these categories. Coming soon.",
};

export type CreateWorkspaceResult =
  { ok: true; id: string } | { ok: false; message: string };

export type CreateWorkspaceFn = (input: {
  name: string;
  institutionType: AvailableInstitutionType;
}) => Promise<CreateWorkspaceResult>;

export function CreateWorkspaceForm({
  redirectUrl,
  createWorkspace,
}: {
  redirectUrl: string;
  createWorkspace: CreateWorkspaceFn;
}) {
  const router = useRouter();
  const { workspaceId } = useAuth();
  const { workspaces, setActive } = useWorkspaceList();
  const destination = postWorkspacePath(redirectUrl);
  const alreadyMember = workspaceId != null || workspaces.length > 0;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      institutionType: DEFAULT_INSTITUTION_TYPE,
    },
  });

  // Workspace Creation is not offered once the User belongs to a Workspace.
  useEffect(() => {
    if (alreadyMember) router.replace(destination);
  }, [alreadyMember, destination, router]);

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await createWorkspace({
        name: values.name,
        institutionType: values.institutionType,
      });
      if (!result.ok) {
        setError("root", { message: result.message });
        return;
      }
      const { error } = await setActive(result.id, destination);
      if (error != null)
        setError("root", {
          message: "Your workspace was created. Reload the page to open it.",
        });
    } catch {
      setError("root", {
        message: "Could not create your workspace. Please try again.",
      });
    }
  };

  if (alreadyMember) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AuthHeading
        title="Create your workspace"
        description="Name the workspace you'll work in"
      />
      <form
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event);
        }}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Workspace name</Label>
          <Input
            id="name"
            autoComplete="organization"
            autoFocus
            placeholder="e.g. Apex Training Institute"
            className="h-10"
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <fieldset className="space-y-4">
          <legend id="institution-type-label" className="text-sm font-medium">
            What kind of institution is this?
          </legend>
          <Controller
            name="institutionType"
            control={control}
            render={({ field }) => (
              <RadioGroup
                name={field.name}
                value={field.value}
                inputRef={field.ref}
                onBlur={field.onBlur}
                onValueChange={(value) => {
                  if (
                    typeof value !== "string" ||
                    !isAvailableInstitutionType(value)
                  ) {
                    return;
                  }
                  field.onChange(value);
                }}
                aria-labelledby="institution-type-label"
                aria-invalid={errors.institutionType != null}
                className="grid-cols-2 gap-2"
              >
                {INSTITUTION_TYPES.map((type) => {
                  const Icon = INSTITUTION_TYPE_ICONS[type.value];
                  const selected = field.value === type.value;
                  return (
                    <div key={type.value} className="relative min-w-0">
                      <RadioGroupItem
                        id={`institution-type-${type.value}`}
                        value={type.value}
                        disabled={!type.available}
                        className="peer sr-only"
                      />
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Label
                              htmlFor={`institution-type-${type.value}`}
                              className={`peer-focus-visible:ring-ring/50 flex min-h-28 w-full flex-col items-start justify-between gap-2 rounded-xl border p-3 text-left leading-snug transition-colors peer-focus-visible:ring-3 peer-disabled:pointer-events-auto ${
                                selected
                                  ? "border-primary bg-primary/5 text-foreground"
                                  : "border-border text-muted-foreground"
                              } ${
                                type.available
                                  ? "hover:border-primary/60 cursor-pointer"
                                  : "cursor-not-allowed opacity-60"
                              }`}
                            >
                              <Icon
                                aria-hidden="true"
                                className="size-5 shrink-0"
                              />
                              <span className="flex w-full flex-col gap-1">
                                <span>{type.label}</span>
                                {type.available ? null : (
                                  <span className="text-[10px] font-normal whitespace-nowrap">
                                    Coming soon
                                  </span>
                                )}
                              </span>
                            </Label>
                          }
                        />
                        <TooltipContent>
                          {INSTITUTION_TYPE_TOOLTIPS[type.value]}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}
              </RadioGroup>
            )}
          />
          <FieldError message={errors.institutionType?.message} />
        </fieldset>
        <FormAlert message={errors.root?.message} />
        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-4 h-10 w-full"
        >
          {isSubmitting ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </>
  );
}
