export {};

declare global {
  interface Window {
    __BOOT_FLAGS__?: Record<string, unknown>;
  }
}
