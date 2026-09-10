import { App } from '@capacitor/app';
import { StatusBar } from '@capacitor/status-bar';

type FullscreenChangeListener = (isFullscreen: boolean, element: Element | null) => void;

class FullscreenManagerClass {
  private listeners: Set<FullscreenChangeListener> = new Set();
  private backButtonListener: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      document.addEventListener('fullscreenchange', this.handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange);
      document.addEventListener('fullscreenerror', this.handleFullscreenError);
      document.addEventListener('webkitfullscreenerror', this.handleFullscreenError);
      this.setupAndroidBackButton();
    }
  }

  private setupAndroidBackButton() {
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
      App.addListener('backButton', () => {
        if (this.getFullscreenElement()) {
          console.log('[FULLSCREEN_MANAGER] Android Back button pressed while in fullscreen. Exiting fullscreen.');
          this.exitFullscreen();
        }
      }).then((listener) => {
        this.backButtonListener = listener;
      }).catch(() => {});
    }
  }

  public getFullscreenElement(): Element | null {
    if (typeof document === 'undefined') return null;
    return document.fullscreenElement || (document as any).webkitFullscreenElement || null;
  }

  public isFullscreen(element?: Element | null): boolean {
    const activeFsEl = this.getFullscreenElement();
    if (!element) {
      return !!activeFsEl;
    }
    return activeFsEl === element || (activeFsEl !== null && element.contains(activeFsEl));
  }

  public async requestFullscreen(targetElement: HTMLElement): Promise<boolean> {
    console.log('[FULLSCREEN_MANAGER] Fullscreen request initiated', {
      targetTagName: targetElement?.tagName,
      targetClasses: targetElement?.className,
      hasVideoChild: !!targetElement?.querySelector('video'),
      isFullscreenActive: !!this.getFullscreenElement(),
    });

    if (!targetElement) {
      console.error('[FULLSCREEN_MANAGER] Cannot request fullscreen: targetElement is null or undefined');
      return false;
    }

    const videoEl = targetElement.tagName === 'VIDEO' ? targetElement : targetElement.querySelector('video');
    console.log('[FULLSCREEN_MANAGER] Target video element found:', !!videoEl);

    try {
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
        StatusBar.hide().catch(() => {});
      }

      if (targetElement.requestFullscreen) {
        console.log('[FULLSCREEN_MANAGER] Calling targetElement.requestFullscreen()');
        await targetElement.requestFullscreen();
      } else if ((targetElement as any).webkitRequestFullscreen) {
        console.log('[FULLSCREEN_MANAGER] Calling targetElement.webkitRequestFullscreen()');
        await (targetElement as any).webkitRequestFullscreen();
      } else if (videoEl && (videoEl as any).webkitEnterFullscreen) {
        console.log('[FULLSCREEN_MANAGER] Calling videoEl.webkitEnterFullscreen()');
        await (videoEl as any).webkitEnterFullscreen();
      } else {
        throw new Error('Native Fullscreen API is not supported on this device/element.');
      }

      console.log('[FULLSCREEN_MANAGER] requestFullscreen() resolved successfully. Active element tag:', this.getFullscreenElement()?.tagName);
      return true;
    } catch (err: any) {
      console.warn('[FULLSCREEN_MANAGER] requestFullscreen() rejected or failed:', err?.message || err);
      return false;
    }
  }

  public async exitFullscreen(): Promise<boolean> {
    console.log('[FULLSCREEN_MANAGER] Exiting native fullscreen', {
      hasActiveFullscreenElement: !!this.getFullscreenElement(),
    });

    if (!this.getFullscreenElement()) {
      return true;
    }

    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      }

      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
        StatusBar.show().catch(() => {});
      }

      console.log('[FULLSCREEN_MANAGER] exitFullscreen() resolved successfully.');
      return true;
    } catch (err: any) {
      console.warn('[FULLSCREEN_MANAGER] exitFullscreen() failed:', err?.message || err);
      return false;
    }
  }

  public async toggleFullscreen(targetElement: HTMLElement): Promise<boolean> {
    console.log('[FULLSCREEN_MANAGER] toggleFullscreen called', {
      isCurrentlyFullscreen: this.isFullscreen(targetElement),
      hasActiveFullscreenElement: !!this.getFullscreenElement(),
    });

    if (this.isFullscreen(targetElement)) {
      return this.exitFullscreen();
    } else {
      return this.requestFullscreen(targetElement);
    }
  }

  private handleFullscreenChange = () => {
    const activeEl = this.getFullscreenElement();
    const isFs = !!activeEl;
    console.log('[FULLSCREEN_MANAGER] fullscreenchange event fired', {
      isFullscreen: isFs,
      activeElementTag: activeEl?.tagName,
    });

    if (!isFs && typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
      StatusBar.show().catch(() => {});
    }

    this.listeners.forEach((listener) => listener(isFs, activeEl));
  };

  private handleFullscreenError = (event: Event) => {
    console.error('[FULLSCREEN_MANAGER] fullscreenerror event fired', {
      eventType: event?.type,
      activeElementTag: this.getFullscreenElement()?.tagName,
    });
  };

  public addListener(listener: FullscreenChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const FullscreenManager = new FullscreenManagerClass();
export default FullscreenManager;
