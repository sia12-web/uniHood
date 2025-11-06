import { useEffect } from 'react';

export function useBeforeUnload(shouldBlock: boolean, message: string): void {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!shouldBlock) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [shouldBlock, message]);
}
