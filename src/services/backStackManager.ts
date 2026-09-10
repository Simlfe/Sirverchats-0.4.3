import { useEffect } from 'react';

export type BackHandlerCallback = () => boolean | void;

interface BackStackItem {
  id: string;
  close: BackHandlerCallback;
}

class BackStackManager {
  private stack: BackStackItem[] = [];

  /**
   * Push a close handler onto the LIFO stack. Returns an unregister function.
   */
  push(id: string, close: BackHandlerCallback): () => void {
    // Remove any existing item with the same id to maintain unique entries
    this.stack = this.stack.filter((item) => item.id !== id);
    this.stack.push({ id, close });

    return () => {
      this.unregister(id);
    };
  }

  unregister(id: string): void {
    this.stack = this.stack.filter((item) => item.id !== id);
  }

  /**
   * Pop and execute the top close handler (LIFO order).
   * Returns true if an overlay/modal was handled and closed.
   */
  handleBack(): boolean {
    while (this.stack.length > 0) {
      const top = this.stack.pop();
      if (top && typeof top.close === 'function') {
        try {
          const result = top.close();
          if (result !== false) {
            return true;
          }
        } catch (err) {
          console.warn('Error executing back handler for', top.id, err);
        }
      }
    }
    return false;
  }

  get length(): number {
    return this.stack.length;
  }

  clear(): void {
    this.stack = [];
  }
}

export const backStackManager = new BackStackManager();

/**
 * Custom React Hook to automatically register/unregister back button handlers for temporary UI overlays
 */
export function useBackHandler(id: string, isOpen: boolean, onClose: BackHandlerCallback) {
  useEffect(() => {
    if (isOpen) {
      const unregister = backStackManager.push(id, onClose);
      return unregister;
    }
  }, [id, isOpen, onClose]);
}
