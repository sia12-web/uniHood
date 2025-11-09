export interface TimerHandle {
  cancel: () => void;
}

export type TimerCallback = (sessionId: string, roundIndex: number) => Promise<void> | void;

export interface TimerScheduler {
  setCallback(callback: TimerCallback): void;
  schedule(sessionId: string, roundIndex: number, delayMs: number): TimerHandle;
  cancel(sessionId: string): void;
}

export function createTimerScheduler(): TimerScheduler {
  const handles = new Map<string, ReturnType<typeof setTimeout>>();
  let callback: TimerCallback | null = null;

  return {
    setCallback(cb: TimerCallback) {
      callback = cb;
    },
    schedule(sessionId: string, roundIndex: number, delayMs: number): TimerHandle {
      const key = `${sessionId}:${roundIndex}`;
      const timeout = setTimeout(async () => {
        handles.delete(key);
        if (callback) {
          await callback(sessionId, roundIndex);
        }
      }, delayMs);
      handles.set(key, timeout);
      return {
        cancel() {
          const existing = handles.get(key);
          if (existing) {
            clearTimeout(existing);
            handles.delete(key);
          }
        },
      };
    },
    cancel(sessionId: string) {
      for (const key of handles.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
          const timeout = handles.get(key);
          if (timeout) {
            clearTimeout(timeout);
          }
          handles.delete(key);
        }
      }
    },
  };
}
