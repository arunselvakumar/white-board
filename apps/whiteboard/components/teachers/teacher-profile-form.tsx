"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import type { TeacherDocumentInput, TeacherProfile, TeacherWriteInput } from "@/src/queries/teachers";
import { TeacherAvatar } from "./teacher-avatar";
import { encodeTeacherPhoto } from "./teacher-files";
import { teacherFormSchema, teacherFormToWriteInput, teacherToFormValues, type TeacherFormValues } from "./teacher-form-values";

export type PendingTeacherDocument = { id: string; kind: TeacherDocumentInput["kind"]; file: File };

const kindOptions = [{ value: "centre_teacher", label: "Centre Teacher" }, { value: "visiting_tutor", label: "Visiting Tutor" }];
const salutationOptions = ["mr", "mrs", "ms", "miss", "mx", "dr", "prof"].map((value) => ({ value, label: value === "mx" ? "Mx." : `${value.charAt(0).toUpperCase()}${value.slice(1)}.` }));
const genderOptions = [{ value: "female", label: "Female" }, { value: "male", label: "Male" }, { value: "non_binary", label: "Non-binary" }, { value: "prefer_not_to_say", label: "Prefer not to say" }];
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, value) => ({ value: String(value), label }));
const backgroundOptions = [{ value: "not_checked", label: "Not checked" }, { value: "pending", label: "Pending" }, { value: "completed", label: "Completed" }, { value: "needs_review", label: "Needs review" }];
const payOptions = [{ value: "monthly", label: "Monthly" }, { value: "hourly", label: "Hourly" }, { value: "per_batch", label: "Per Batch" }];
const documentOptions = [{ value: "certificate", label: "Certificate" }, { value: "identity", label: "ID proof" }, { value: "background_check", label: "Background check" }, { value: "other", label: "Other" }];

function Section({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="bg-card rounded-2xl border p-5 shadow-sm sm:p-7">
    <div className="mb-6 flex gap-4 border-b pb-5"><span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold">{number}</span><div><h2 className="text-lg font-semibold tracking-tight">{title}</h2><p className="text-muted-foreground mt-1 text-sm">{description}</p></div></div>
    {children}
  </section>;
}

export function TeacherForm({ teacher, onSubmit, onCancel }: {
  teacher?: TeacherProfile;
  onSubmit: (input: TeacherWriteInput, documents: PendingTeacherDocument[]) => Promise<void>;
  onCancel: () => void;
}) {
  const { register, control, handleSubmit, setError, getFieldState, formState: { errors, isSubmitting } } = useForm<TeacherFormValues>({ resolver: zodResolver(teacherFormSchema), defaultValues: teacherToFormValues(teacher) });
  const { fields: slots, append, remove } = useFieldArray({ control, name: "availability" });
  const documentKind = useWatch({ control, name: "documentKind" });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoObjectUrl, setPhotoObjectUrl] = useState<string | null>(null);
  const photoPreview = photoObjectUrl ?? teacher?.photoUrl ?? null;
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PendingTeacherDocument[]>([]);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [clearIdNumber, setClearIdNumber] = useState(false);
  const [clearBankAccountNumber, setClearBankAccountNumber] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (photoObjectUrl != null) URL.revokeObjectURL(photoObjectUrl);
  }, [photoObjectUrl]);

  type TextName = Exclude<keyof TeacherFormValues, "availability" | "documentKind">;
  const textField = (name: TextName, label: string, type = "text", placeholder?: string) => <div className="space-y-1.5" key={name}>
    <Label htmlFor={`teacher-${name}`}>{label}</Label>
    <Input id={`teacher-${name}`} type={type} placeholder={placeholder} readOnly={name === "email" && teacher != null} autoComplete={name === "idNumber" || name === "bankAccountNumber" ? "off" : undefined} {...register(name)} />
    <FieldError message={getFieldState(name).error?.message} />
  </div>;
  const longField = (name: "address" | "qualificationSummary" | "bio" | "backgroundCheckNote", label: string) => <div className="space-y-1.5 sm:col-span-2" key={name}>
    <Label htmlFor={`teacher-${name}`}>{label}</Label><Textarea id={`teacher-${name}`} rows={3} {...register(name)} /><FieldError message={getFieldState(name).error?.message} />
  </div>;
  const selectField = (name: "kind" | "salutation" | "gender" | "backgroundCheckStatus" | "payBasis" | "documentKind", label: string, options: { value: string; label: string }[]) => <div className="space-y-1.5" key={name}>
    <Label htmlFor={`teacher-${name}`}>{label}</Label><Controller name={name} control={control} render={({ field }) => <Select items={options} value={field.value} onValueChange={(value) => { field.onChange(value ?? ""); }}><SelectTrigger id={`teacher-${name}`} className="w-full"><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger><SelectContent align="start" alignItemWithTrigger={false}>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>} />
    <FieldError message={getFieldState(name).error?.message} />
  </div>;

  function choosePhoto(file?: File) {
    if (file == null) return;
    if (!file.type.startsWith("image/") || file.size === 0 || file.size > 10 * 1024 * 1024) { setPhotoError("Choose an image smaller than 10 MB."); return; }
    setPhotoFile(file); setPhotoObjectUrl(URL.createObjectURL(file)); setPhotoError(null);
  }
  function chooseDocument(file?: File) {
    if (file == null) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size === 0 || file.size > 3 * 1024 * 1024 || Array.from(file.name).some((character) => character === "/" || character === "\\" || character.charCodeAt(0) < 32)) { setDocumentError("Choose a PDF, JPEG, or PNG document smaller than 3 MB."); return; }
    if (documents.length >= 10) { setDocumentError("A Teacher can have at most ten documents."); return; }
    setDocuments((current) => [...current, { id: crypto.randomUUID(), kind: documentKind, file }]); setDocumentError(null);
  }

  return <form noValidate className="space-y-7" onSubmit={(event) => {
    if (teacher == null && photoFile == null) setPhotoError("Teacher photo is required");
    void handleSubmit(async (values) => {
      if (teacher == null && photoFile == null) return;
      try {
        const input = teacherFormToWriteInput(values, teacher, { idNumber: clearIdNumber, bankAccountNumber: clearBankAccountNumber });
        if (photoFile != null) input.photo = await encodeTeacherPhoto(photoFile);
        await onSubmit(input, documents);
      } catch (error) { applyHttpFormError(error, setError, "Could not save this Teacher. Please try again."); }
    })(event);
  }}>
    <FormAlert message={errors.root?.message} />
    <Section number="01" title="Teacher details" description="Identify this Teacher and keep the right contact details.">
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_11rem]"><div className="grid gap-5 sm:grid-cols-2">
        {selectField("salutation", "Salutation", salutationOptions)}{selectField("gender", "Gender", genderOptions)}
        <div className="sm:col-span-2">{textField("name", "Full name")}</div>{textField("preferredName", "Preferred display name")}{selectField("kind", "Teacher type", kindOptions)}
        {textField("email", "Email", "email")}{textField("phone", "Primary phone", "tel")}{textField("alternatePhone", "Alternate phone", "tel")}{textField("dateOfBirth", "Date of birth", "date")}{textField("cityArea", "City or area")}
        {longField("address", "Full address")}{textField("emergencyContactName", "Emergency contact name")}{textField("emergencyContactPhone", "Emergency contact phone", "tel")}
      </div><div className="space-y-3"><Label>Teacher photo</Label><div className="bg-muted/40 flex h-36 items-center justify-center rounded-xl border border-dashed"><TeacherAvatar name={teacher?.name ?? "Teacher"} photoUrl={photoPreview} className="size-24" /></div>
        <input ref={cameraInput} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { choosePhoto(event.target.files?.[0]); }} />
        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { choosePhoto(event.target.files?.[0]); }} />
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => cameraInput.current?.click()}><Camera className="size-4" /> Take photo</Button><Button type="button" variant="outline" size="sm" onClick={() => photoInput.current?.click()}><Upload className="size-4" /> Upload photo</Button></div>
        <p className="text-muted-foreground text-xs">JPEG, PNG, or WebP. Large photos are resized before saving.</p><FieldError message={photoError ?? undefined} />
      </div></div>
    </Section>

    <Section number="02" title="Teaching profile" description="Record teaching strengths. Batch assignments remain on the Teacher profile."><div className="grid gap-5 sm:grid-cols-2">
      {textField("teachingSpecialisms", "Teaching specialisms", "text", "Drawing, Painting, Python")}{textField("learnerLevels", "Learner levels", "text", "Beginner, Advanced")}{textField("yearsExperience", "Years of teaching experience", "number")}{textField("highestQualification", "Highest qualification")}
      {textField("certifications", "Certifications or training", "text", "Separate entries with commas")}{textField("languages", "Languages taught in", "text", "Hindi, English")}{textField("portfolioUrl", "Portfolio or work link", "url")}{textField("startDate", "Start date", "date")}
      {longField("qualificationSummary", "Qualification summary")}{longField("bio", "Short bio")}
    </div></Section>

    <Section number="03" title="Weekly availability" description="Record the days and times this Teacher is usually available."><div className="space-y-4">
      {slots.map((slot, index) => <div key={slot.id} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]">
        <div className="space-y-1.5"><Label htmlFor={`availability-day-${index}`}>Day</Label><Controller name={`availability.${index}.dayOfWeek`} control={control} render={({ field }) => <Select items={days} value={field.value} onValueChange={(value) => { field.onChange(value ?? ""); }}><SelectTrigger id={`availability-day-${index}`} className="w-full"><SelectValue placeholder="Choose day" /></SelectTrigger><SelectContent align="start" alignItemWithTrigger={false}>{days.map((day) => <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>)}</SelectContent></Select>} /></div>
        <div className="space-y-1.5"><Label htmlFor={`availability-start-${index}`}>From</Label><Input id={`availability-start-${index}`} type="time" {...register(`availability.${index}.startTime`)} /></div>
        <div className="space-y-1.5"><Label htmlFor={`availability-end-${index}`}>To</Label><Input id={`availability-end-${index}`} type="time" {...register(`availability.${index}.endTime`)} /></div>
        <Button type="button" variant="outline" size="icon" aria-label={`Remove availability ${index + 1}`} onClick={() => { remove(index); }}><Trash2 className="size-4" /></Button>
      </div>)}<FieldError message={errors.availability?.message} /><Button type="button" variant="outline" onClick={() => { append({ dayOfWeek: "1", startTime: "09:00", endTime: "12:00" }); }}><Plus className="size-4" /> Add availability</Button>
    </div></Section>

    <Section number="04" title="Verification" description="Private details for the Owner's records. Supporting documents are kept below."><div className="grid gap-5 sm:grid-cols-2">
      {textField("idProofType", "ID proof type", "text", "Type of ID shown")}
      <div>{textField("idNumber", "ID number")}{teacher?.privateDetails.idNumberLast4 && !clearIdNumber && <p className="text-muted-foreground mt-1 text-xs">Stored ID ending in {teacher.privateDetails.idNumberLast4}. Leave blank to keep it.</p>}{teacher?.privateDetails.idNumberLast4 && <Button type="button" variant="ghost" size="sm" onClick={() => { setClearIdNumber((value) => !value); }}>{clearIdNumber ? "Keep stored ID" : "Clear stored ID"}</Button>}</div>
      {selectField("backgroundCheckStatus", "Background check status", backgroundOptions)}{textField("backgroundCheckDate", "Background check date", "date")}{longField("backgroundCheckNote", "Background check note")}
    </div></Section>

    <Section number="05" title="Pay details" description="Owner-only records. Whiteboard does not process Teacher payouts."><div className="grid gap-5 sm:grid-cols-2">
      {selectField("payBasis", "Pay basis", payOptions)}{textField("payRateRupees", "Pay rate (₹)", "text", "0.00")}{textField("bankAccountHolder", "Bank account holder")}{textField("bankName", "Bank name")}{textField("bankIfsc", "Bank IFSC")}
      <div>{textField("bankAccountNumber", "Bank account number")}{teacher?.privateDetails.bankAccountLast4 && !clearBankAccountNumber && <p className="text-muted-foreground mt-1 text-xs">Stored account ending in {teacher.privateDetails.bankAccountLast4}. Leave blank to keep it.</p>}{teacher?.privateDetails.bankAccountLast4 && <Button type="button" variant="ghost" size="sm" onClick={() => { setClearBankAccountNumber((value) => !value); }}>{clearBankAccountNumber ? "Keep stored account" : "Clear stored account"}</Button>}</div>
    </div></Section>

    {teacher == null && <Section number="06" title="Documents" description="Attach certificates, ID proof, or background check records. Only the Owner can access these files.">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">{selectField("documentKind", "Document type", documentOptions)}<input ref={documentInput} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { chooseDocument(event.target.files?.[0]); event.target.value = ""; }} /><Button type="button" variant="outline" onClick={() => documentInput.current?.click()}><Plus className="size-4" /> Add document</Button></div>
      <FieldError message={documentError ?? undefined} />
      {documents.length > 0 && <ul className="mt-4 divide-y rounded-xl border">{documents.map((document) => <li key={document.id} className="flex items-center justify-between gap-3 p-3 text-sm"><span className="min-w-0 truncate">{document.file.name} · {document.kind.replaceAll("_", " ")}</span><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${document.file.name}`} onClick={() => { setDocuments((current) => current.filter((item) => item.id !== document.id)); }}><Trash2 className="size-4" /></Button></li>)}</ul>}
    </Section>}
    <div className="flex gap-3 pb-8"><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : teacher ? "Save changes" : "Add Teacher"}</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button></div>
  </form>;
}
