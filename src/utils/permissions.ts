export interface PermissionResult {
  granted: boolean;
  state?: 'granted' | 'denied' | 'prompt';
  error?: string;
}

type PermissionChangeCallback = (type: 'microphone' | 'camera', state: 'granted' | 'denied' | 'prompt') => void;
const permissionListeners = new Set<PermissionChangeCallback>();

let isMonitoringStarted = false;
let cachedProbedAudioStream: MediaStream | null = null;
let cachedStreamExpiryTimeout: any = null;

export function consumeProbedAudioStream(): MediaStream | null {
  if (cachedProbedAudioStream) {
    if (cachedStreamExpiryTimeout) {
      clearTimeout(cachedStreamExpiryTimeout);
      cachedStreamExpiryTimeout = null;
    }
    const stream = cachedProbedAudioStream;
    cachedProbedAudioStream = null;
    const tracks = stream.getAudioTracks();
    if (tracks.length > 0 && tracks[0].readyState === 'live') {
      return stream;
    }
  }
  return null;
}

export async function hasMicrophoneDevice(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return true; // Default to true if enumerateDevices is unsupported
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');
    return audioInputs.length > 0;
  } catch {
    return true;
  }
}

function startPermissionMonitoring() {
  if (isMonitoringStarted || typeof navigator === 'undefined' || !navigator.permissions?.query) return;
  isMonitoringStarted = true;

  const monitorDevice = async (name: 'microphone' | 'camera') => {
    try {
      const status = await navigator.permissions.query({ name: name as any });
      status.onchange = () => {
        console.log(`[Permissions] OS permission changed for ${name}: ${status.state}`);
        permissionListeners.forEach((cb) => cb(name, status.state as any));
      };
    } catch {
      // Permission query not supported for this name on this platform
    }
  };

  monitorDevice('microphone');
  monitorDevice('camera');

  if (navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      console.log('[Permissions] Media devices changed in OS');
      permissionListeners.forEach((cb) => cb('microphone', 'granted'));
    });
  }
}

export function subscribeToPermissionChanges(callback: PermissionChangeCallback): () => void {
  startPermissionMonitoring();
  permissionListeners.add(callback);
  return () => {
    permissionListeners.delete(callback);
  };
}

/**
 * Checks and requests runtime microphone permissions cleanly.
 * Never assumes permissions exist; prompts the user or webview appropriately.
 */
export async function checkAndRequestMicrophonePermission(): Promise<PermissionResult> {
  startPermissionMonitoring();

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      state: 'denied',
      error: 'Audio capture device interface is unavailable in this browser environment.',
    };
  }

  try {
    // Check permission state via Permission API if supported
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as any });
        if (status.state === 'granted') {
          return { granted: true, state: 'granted' };
        }
        // In WebKit2GTK on Linux, status.state may report 'denied' prior to first prompt;
        // fall through directly to getUserMedia to initiate the system prompt.
      } catch {
        // Fallthrough to getUserMedia test
      }
    }

    // Request stream permission explicitly
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Cache probe stream temporarily for 10 seconds so immediate room connection can adopt it
    // without triggering a second hardware acquire cycle
    if (cachedStreamExpiryTimeout) {
      clearTimeout(cachedStreamExpiryTimeout);
    }
    if (cachedProbedAudioStream) {
      cachedProbedAudioStream.getTracks().forEach((t) => t.stop());
    }
    cachedProbedAudioStream = stream;
    cachedStreamExpiryTimeout = setTimeout(() => {
      if (cachedProbedAudioStream) {
        cachedProbedAudioStream.getTracks().forEach((t) => t.stop());
        cachedProbedAudioStream = null;
      }
    }, 10000);

    return { granted: true, state: 'granted' };
  } catch (err: any) {
    console.warn('[Permissions] Microphone access denied or failed:', err);
    const isDenied =
      err?.name === 'NotAllowedError' ||
      err?.name === 'PermissionDeniedError' ||
      err?.message?.toLowerCase().includes('denied') ||
      err?.message?.toLowerCase().includes('permission');

    const isNotFound =
      err?.name === 'NotFoundError' ||
      err?.name === 'DevicesNotFoundError' ||
      err?.message?.toLowerCase().includes('not found') ||
      err?.message?.toLowerCase().includes('no device');

    let errorMessage = err?.message || 'Failed to access microphone.';
    if (isDenied) {
      errorMessage =
        'Voice chat requires microphone access to transmit your audio. Microphone permission was denied in your system settings. Please grant microphone access and try again.';
    } else if (isNotFound) {
      errorMessage =
        'No microphone input device was detected on your system. Please connect a microphone or verify your Linux audio device in system settings.';
    }

    return {
      granted: false,
      state: isDenied ? 'denied' : isNotFound ? 'denied' : 'prompt',
      error: errorMessage,
    };
  }
}

/**
 * Checks and requests runtime camera permissions cleanly.
 */
export async function checkAndRequestCameraPermission(): Promise<PermissionResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      error: 'Camera device interface is unavailable in this browser environment.',
    };
  }

  try {
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'camera' as any });
        if (status.state === 'granted') {
          return { granted: true };
        }
      } catch {
        // Fallthrough
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return { granted: true };
  } catch (err: any) {
    console.warn('[Permissions] Camera access denied or failed:', err);
    const isDenied =
      err?.name === 'NotAllowedError' ||
      err?.name === 'PermissionDeniedError' ||
      err?.message?.toLowerCase().includes('denied') ||
      err?.message?.toLowerCase().includes('permission');

    return {
      granted: false,
      error: isDenied
        ? 'Camera permission was denied. Please grant camera access in your browser or device settings.'
        : err?.message || 'Failed to access camera.',
    };
  }
}

/**
 * Checks screen sharing / MediaProjection availability.
 */
export async function checkAndRequestScreenSharePermission(): Promise<PermissionResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
    return {
      granted: false,
      error: 'Screen sharing / MediaProjection is not supported on this device/browser platform.',
    };
  }
  return { granted: true };
}
