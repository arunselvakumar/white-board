"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  TEST_MAX_MARKS_LIMIT,
  TEST_NAME_MAX,
  TEST_TOPIC_MAX,
  classTestQueries,
  createClassTest,
  updateClassTest,
  type BatchTestStudentView,
  type ClassTestDetailView,
  type ClassTestView,
} from "@/src/queries/class-tests";

import { coversDate, errorCode, errorMessage } from "./test-staff-format";

const WHOLE_NUMBER = /^\d+$/;

type Scope = "batch" | "student";

function isScope(value: unknown): value is Scope {
  return value === "batch" || value === "student";
}

function testSchema({
  firstDate,
  today,
  students,
  checkDate,
}: {
  firstDate: string;
  today: string;
  students: readonly BatchTestStudentView[];
  /** False when the date can't change (a published Test). */
  checkDate: boolean;
}) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Give the Test a name")
        .max(
          TEST_NAME_MAX,
          `Keep the name to ${String(TEST_NAME_MAX)} characters or fewer`,
        ),
      heldOn: z.string().min(1, "Choose the Test date"),
      maxMarks: z
        .string()
        .trim()
        .min(1, "Enter the maximum marks")
        .refine(
          (value) =>
            WHOLE_NUMBER.test(value) &&
            Number(value) >= 1 &&
            Number(value) <= TEST_MAX_MARKS_LIMIT,
          `Maximum marks must be a whole number from 1 to ${String(TEST_MAX_MARKS_LIMIT)}`,
        ),
      passMarks: z
        .string()
        .trim()
        .refine(
          (value) => value === "" || WHOLE_NUMBER.test(value),
          "The pass mark must be a whole number",
        ),
      topic: z
        .string()
        .trim()
        .max(
          TEST_TOPIC_MAX,
          `Keep the topic to ${String(TEST_TOPIC_MAX)} characters or fewer`,
        ),
      scope: z.enum(["batch", "student"]),
      studentId: z.string(),
    })
    .superRefine((value, ctx) => {
      if (checkDate && value.heldOn !== "") {
        if (value.heldOn > today)
          ctx.addIssue({
            code: "custom",
            path: ["heldOn"],
            message: "A Test can’t be dated in the future",
          });
        else if (value.heldOn < firstDate)
          ctx.addIssue({
            code: "custom",
            path: ["heldOn"],
            message: "A Test can’t be dated before the Batch began",
          });
      }
      if (
        value.passMarks !== "" &&
        WHOLE_NUMBER.test(value.passMarks) &&
        WHOLE_NUMBER.test(value.maxMarks) &&
        Number(value.passMarks) > Number(value.maxMarks)
      )
        ctx.addIssue({
          code: "custom",
          path: ["passMarks"],
          message: "The pass mark can’t be above the maximum marks",
        });
      if (value.scope === "student") {
        const student = students.find((item) => item.id === value.studentId);
        if (student == null)
          ctx.addIssue({
            code: "custom",
            path: ["studentId"],
            message: "Choose the Student this Test is for",
          });
        else if (value.heldOn !== "" && !coversDate(student, value.heldOn))
          ctx.addIssue({
            code: "custom",
            path: ["studentId"],
            message: `${student.name} wasn’t in this Batch on that date`,
          });
      }
    });
}

type Values = z.infer<ReturnType<typeof testSchema>>;

function defaults(test: ClassTestView | null, today: string): Values {
  if (test == null)
    return {
      name: "",
      heldOn: today,
      maxMarks: "",
      passMarks: "",
      topic: "",
      scope: "batch",
      studentId: "",
    };
  return {
    name: test.name,
    heldOn: test.heldOn,
    maxMarks: String(test.maxMarks),
    passMarks: test.passMarks == null ? "" : String(test.passMarks),
    topic: test.topic ?? "",
    scope: test.scope,
    studentId: test.student?.id ?? "",
  };
}

/** Create a Test for the Batch, or edit an existing Test's details. */
export function TestFormDialog({
  open,
  onOpenChange,
  batchId,
  firstDate,
  today,
  students = [],
  testsPath,
  test = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  /** Earliest allowed Test date (YYYY-MM-DD). */
  firstDate: string;
  /** Latest allowed Test date (YYYY-MM-DD). */
  today: string;
  /** Students a single-student Test can be set for (create only). */
  students?: readonly BatchTestStudentView[];
  /** The Batch's Tests page; a new Test opens at `${testsPath}/${id}`. */
  testsPath: string;
  /** The Test being edited; null to create a Test. */
  test?: ClassTestView | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {test == null ? "Create test" : "Edit test details"}
          </DialogTitle>
          <DialogDescription>
            {test == null
              ? "Set up the Test, then enter each Student’s marks. Nothing is visible to Students or Parents until you publish."
              : "Change the name, marks, or topic. The date can change only before publishing."}
          </DialogDescription>
        </DialogHeader>
        <TestForm
          key={test?.id ?? "new"}
          batchId={batchId}
          firstDate={firstDate}
          today={today}
          students={students}
          testsPath={testsPath}
          test={test}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function TestForm({
  batchId,
  firstDate,
  today,
  students,
  testsPath,
  test,
  onDone,
}: {
  batchId: string;
  firstDate: string;
  today: string;
  students: readonly BatchTestStudentView[];
  testsPath: string;
  test: ClassTestView | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const creating = test == null;
  const dateLocked = test?.publishedAt != null;
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(
      testSchema({ firstDate, today, students, checkDate: !dateLocked }),
    ),
    defaultValues: defaults(test, today),
  });
  const [scope, heldOn, topic] = useWatch({
    control,
    name: ["scope", "heldOn", "topic"],
  });
  const available = students.filter(
    (student) => heldOn !== "" && coversDate(student, heldOn),
  );
  const studentItems = available.map((student) => ({
    value: student.id,
    label: student.name,
  }));

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        const input = {
          name: values.name,
          heldOn: values.heldOn,
          maxMarks: Number(values.maxMarks),
          passMarks: values.passMarks === "" ? null : Number(values.passMarks),
          topic: values.topic === "" ? null : values.topic,
        };
        let saved: ClassTestDetailView;
        try {
          saved =
            test == null
              ? await createClassTest(batchId, {
                  ...input,
                  studentId:
                    values.scope === "student" ? values.studentId : null,
                })
              : await updateClassTest(test.id, input);
        } catch (error) {
          const code = errorCode(error);
          const message = errorMessage(error);
          if (code === "CLASS_TEST_NAME_INVALID") setError("name", { message });
          else if (
            code === "CLASS_TEST_DATE_INVALID" ||
            code === "CLASS_TEST_DATE_IN_FUTURE" ||
            code === "CLASS_TEST_DATE_BEFORE_BATCH" ||
            code === "CLASS_TEST_DATE_LOCKED"
          )
            setError("heldOn", { message });
          else if (
            code === "CLASS_TEST_MAX_MARKS_INVALID" ||
            code === "CLASS_TEST_MAX_BELOW_MARKS"
          )
            setError("maxMarks", { message });
          else if (code === "CLASS_TEST_PASS_MARKS_INVALID")
            setError("passMarks", { message });
          else if (code === "CLASS_TEST_TOPIC_TOO_LONG")
            setError("topic", { message });
          else if (
            code === "CLASS_TEST_STUDENT_NOT_IN_BATCH" &&
            creating &&
            values.scope === "student"
          )
            setError("studentId", { message });
          else if (code === "CLASS_TEST_STUDENT_NOT_IN_BATCH")
            setError("heldOn", { message });
          else setError("root", { message });
          return;
        }
        queryClient.setQueryData(
          classTestQueries.key.detail(saved.test.id),
          saved,
        );
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: classTestQueries.key.batch(batchId),
          }),
          creating
            ? null
            : queryClient.invalidateQueries({
                queryKey: [...classTestQueries.key.all, "student"],
              }),
        ]);
        onDone();
        if (creating) router.push(`${testsPath}/${saved.test.id}`);
      })}
    >
      <div className="space-y-1.5">
        <Label htmlFor="test-name">Test name</Label>
        <Input
          id="test-name"
          className="h-10"
          maxLength={TEST_NAME_MAX}
          placeholder="e.g. Unit test 1: Excel formulas"
          aria-invalid={errors.name != null}
          {...register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="test-date">Date</Label>
          <Input
            id="test-date"
            type="date"
            className="h-10"
            min={firstDate}
            max={today}
            disabled={dateLocked}
            aria-invalid={errors.heldOn != null}
            aria-describedby={dateLocked ? "test-date-locked" : undefined}
            {...register("heldOn")}
          />
          {dateLocked ? (
            <p id="test-date-locked" className="text-muted-foreground text-xs">
              The date can’t change after the Test is published.
            </p>
          ) : null}
          <FieldError message={errors.heldOn?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="test-max-marks">Maximum marks</Label>
          <Input
            id="test-max-marks"
            inputMode="numeric"
            className="h-10"
            placeholder="e.g. 50"
            aria-invalid={errors.maxMarks != null}
            {...register("maxMarks")}
          />
          <FieldError message={errors.maxMarks?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="test-pass-marks">Pass mark (optional)</Label>
          <Input
            id="test-pass-marks"
            inputMode="numeric"
            className="h-10"
            placeholder="e.g. 20"
            aria-invalid={errors.passMarks != null}
            {...register("passMarks")}
          />
          <FieldError message={errors.passMarks?.message} />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="test-topic">Topic or syllabus (optional)</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {topic.length}/{TEST_TOPIC_MAX}
          </span>
        </div>
        <Textarea
          id="test-topic"
          rows={3}
          maxLength={TEST_TOPIC_MAX}
          placeholder="e.g. SUM, AVERAGE, and IF"
          aria-invalid={errors.topic != null}
          {...register("topic")}
        />
        <FieldError message={errors.topic?.message} />
      </div>
      {creating ? (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium">Who takes it</legend>
          <Controller
            name="scope"
            control={control}
            render={({ field }) => (
              <RadioGroup
                name={field.name}
                value={field.value}
                onValueChange={(value) => {
                  if (isScope(value)) field.onChange(value);
                }}
                className="grid gap-2 sm:grid-cols-2"
              >
                <ScopeChoice
                  id="test-scope-batch"
                  value="batch"
                  label="Whole Batch"
                  detail="Every Student in the Batch on the Test date."
                />
                <ScopeChoice
                  id="test-scope-student"
                  value="student"
                  label="One Student"
                  detail="A re-test or a make-up Test for one Student."
                />
              </RadioGroup>
            )}
          />
          {scope === "student" ? (
            <div className="space-y-1.5 pt-2">
              <Label htmlFor="test-student">Student</Label>
              {available.length === 0 ? (
                <p
                  id="test-student"
                  className="text-muted-foreground bg-muted/50 rounded-lg border p-3 text-sm"
                >
                  No Students were in this Batch on that date.
                </p>
              ) : (
                <Controller
                  name="studentId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      items={studentItems}
                      value={field.value === "" ? null : field.value}
                      onValueChange={(value) => {
                        if (typeof value === "string") field.onChange(value);
                      }}
                    >
                      <SelectTrigger
                        id="test-student"
                        size="lg"
                        className="w-full min-w-0"
                        aria-invalid={errors.studentId != null}
                      >
                        <SelectValue placeholder="Choose a Student" />
                      </SelectTrigger>
                      <SelectContent align="start" alignItemWithTrigger={false}>
                        {studentItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
              <FieldError message={errors.studentId?.message} />
            </div>
          ) : null}
        </fieldset>
      ) : null}
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : creating ? "Create test" : "Save details"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ScopeChoice({
  id,
  value,
  label,
  detail,
}: {
  id: string;
  value: Scope;
  label: string;
  detail: string;
}) {
  return (
    <Label
      htmlFor={id}
      className="has-data-checked:border-primary has-data-checked:bg-primary/5 hover:border-primary/60 flex cursor-pointer items-start gap-3 rounded-xl border p-3 font-normal"
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="min-w-0 space-y-0.5">
        <span className="block font-medium">{label}</span>
        <span className="text-muted-foreground block text-xs">{detail}</span>
      </span>
    </Label>
  );
}
