export const APP_BASE_PATH = "/app";

export function withAppBasePath(path: string): string {
  return `${APP_BASE_PATH}${path}`;
}
