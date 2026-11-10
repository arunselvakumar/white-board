export function AuthDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-xs font-light">or</span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}
