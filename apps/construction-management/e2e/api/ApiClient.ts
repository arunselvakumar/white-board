import type { APIRequestContext, APIResponse } from "@playwright/test";

/**
 * Calls the app's real HTTP API as one signed-in User (their session cookies
 * live in `request`). Tests arrange data with it instead of clicking through
 * set-up screens; only the screen under test is driven in the browser.
 */
export class ApiClient {
  constructor(readonly request: APIRequestContext) {}

  async get<T>(path: string): Promise<T> {
    return this.json<T>(await this.request.get(path), "GET", path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.json<T>(
      await this.request.post(path, { data: body ?? {} }),
      "POST",
      path,
    );
  }

  async postMultipart<T>(
    path: string,
    multipart: Record<
      string,
      string | { name: string; mimeType: string; buffer: Buffer }
    >,
  ): Promise<T> {
    return this.json<T>(
      await this.request.post(path, { multipart }),
      "POST",
      path,
    );
  }

  private async json<T>(
    response: APIResponse,
    method: string,
    path: string,
  ): Promise<T> {
    if (!response.ok())
      throw new Error(
        `${method} ${path} → ${String(response.status())}: ${await response.text()}`,
      );
    const text = await response.text();
    return (text.length === 0 ? undefined : JSON.parse(text)) as T;
  }
}
