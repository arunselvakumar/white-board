/**
 * Replaces `XMLHttpRequest` for one story, for uploads that report
 * progress (Project Documents send their bytes with XHR in development).
 * Each `send` steps through `steps` percentages, then answers `status`.
 * With `holdAt`, uploads stop at that percentage until `release()`.
 */
export function mockXhrUploads(
  options: {
    steps?: number[];
    holdAt?: number;
    status?: number;
    responseText?: string;
    stepMs?: number;
  } = {},
): {
  sent: { url: string; contentType: string | undefined; body: unknown }[];
  release: () => void;
  restore: () => void;
} {
  const {
    steps = [12, 38, 64, 100],
    holdAt,
    status = 204,
    responseText = "",
    stepMs = 40,
  } = options;
  const original = globalThis.XMLHttpRequest;
  const sent: {
    url: string;
    contentType: string | undefined;
    body: unknown;
  }[] = [];
  const waiting: (() => void)[] = [];
  let released = holdAt == null;

  class StoryXhr {
    url = "";
    headers: Record<string, string> = {};
    status = 0;
    statusText = "";
    responseText = "";
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
      onprogress: null,
    };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private aborted = false;

    open(_method: string, url: string) {
      this.url = url;
    }

    setRequestHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    }

    send(body: unknown) {
      sent.push({
        url: this.url,
        contentType: this.headers["content-type"],
        body,
      });
      void this.run();
    }

    abort() {
      this.aborted = true;
      this.onabort?.();
    }

    private isAborted(): boolean {
      return this.aborted;
    }

    private progress(percentage: number) {
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: percentage,
        total: 100,
      } as ProgressEvent);
    }

    private async run() {
      for (const step of steps) {
        await new Promise((resolve) => setTimeout(resolve, stepMs));
        if (this.aborted) return;
        if (!released && holdAt != null && step > holdAt) {
          await new Promise<void>((resolve) => waiting.push(resolve));
          // `abort()` may have run while this upload waited.
          if (this.isAborted()) return;
        }
        this.progress(step);
      }
      this.status = status;
      this.responseText = responseText;
      this.onload?.();
    }
  }

  globalThis.XMLHttpRequest = StoryXhr as unknown as typeof XMLHttpRequest;
  return {
    sent,
    release: () => {
      released = true;
      for (const resume of waiting.splice(0)) resume();
    },
    restore: () => {
      globalThis.XMLHttpRequest = original;
    },
  };
}
