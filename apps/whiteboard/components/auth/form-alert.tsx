export function FormAlert({ message }: { message: string | undefined }) {
  if (message == null || message.length === 0) {
    return null;
  }
  return (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  );
}
