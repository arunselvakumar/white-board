import Image from "next/image";

export function AuthHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Image
        src="/whiteboard-logo.svg"
        alt="Whiteboard"
        width={48}
        height={48}
        priority
      />
      <div className="space-y-1">
        <h1 className="text-foreground text-2xl">{title}</h1>
        <p className="text-muted-foreground text-sm font-light">
          {description}
        </p>
      </div>
    </div>
  );
}
