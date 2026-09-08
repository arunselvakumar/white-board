export function FieldError({ message }: { message: string | undefined }) {
  if (message == null || message.length === 0) {
    return null;
  }
  return <p className="text-destructive text-sm">{message}</p>;
}
