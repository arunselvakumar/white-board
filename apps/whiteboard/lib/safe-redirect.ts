const DEFAULT_REDIRECT = "/";

export function safeRedirectPath(value: string | undefined): string {
  if (value == null || value.length === 0) {
    return DEFAULT_REDIRECT;
  }

  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
  ) {
    if (value.includes("://")) {
      return DEFAULT_REDIRECT;
    }
    return value;
  }

  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.length > 0 ? path : DEFAULT_REDIRECT;
  } catch {
    return DEFAULT_REDIRECT;
  }
}
