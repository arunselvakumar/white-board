import { UserButton } from "@clerk/nextjs";
import Image from "next/image";

export function AuthHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div className="flex items-center gap-2">
        <Image src="/whiteboard-logo.svg" alt="" width={28} height={28} />
        <p className="text-sm tracking-tight">Whiteboard</p>
      </div>
      <UserButton />
    </header>
  );
}
