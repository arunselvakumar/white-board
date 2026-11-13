/** A field's error; give it an `id` so its control can point at it. */
export function FieldError({
  message,
  id,
}: {
  message: string | undefined;
  id?: string;
}) {
  if (message == null || message.length === 0) {
    return null;
  }
  return (
    <p id={id} className="text-destructive text-sm">
      {message}
    </p>
  );
}
