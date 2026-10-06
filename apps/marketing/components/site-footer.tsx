import Image from "next/image";

const linkClass =
  "rounded-md text-sm font-semibold text-foreground/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const links = [
  { href: "/app/login", label: "Sign in" },
  { href: "/app/signup", label: "Create your Workspace" },
  { href: "#how-it-works", label: "How it works" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-border bg-background border-t">
      <div className="container-site py-14 md:py-16">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <div className="flex items-center gap-2.5">
              <Image
                src="/whiteboard-logo.svg"
                alt="Whiteboard"
                width={28}
                height={28}
              />
              <span className="text-lg font-semibold tracking-[-0.01em]">
                Whiteboard
              </span>
            </div>
            <p className="text-muted-foreground mt-4 max-w-[46ch] text-[1.0625rem] leading-[1.6]">
              Education management for Training Institutes. Whiteboard is the
              application; this is its public site.
            </p>
          </div>
          <nav aria-label="Footer" className="lg:col-span-5 lg:col-start-8">
            <ul className="border-border border-t">
              {links.map((link) => (
                <li key={link.href} className="border-border border-b py-3">
                  <a href={link.href} className={linkClass}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="text-muted-foreground mt-14 text-sm">© 2026 Whiteboard</p>
      </div>
    </footer>
  );
}
