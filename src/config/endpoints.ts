/**
 * Centralized Application Endpoints & Configuration
 *
 * Exports all backend URLs, APIs, WebSocket endpoints, and LiveKit services.
 * Every part of the application must import URLs from this file instead of hardcoding them.
 */

const getEnvVar = (key: string): string | undefined => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    return (import.meta as any).env[key];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

const resolveTokenEndpoint = (): string => {
  const envVal = getEnvVar('VITE_LIVEKIT_TOKEN_ENDPOINT');
  if (envVal && !envVal.includes('api.sirverdata.top')) {
    return envVal;
  }
  return 'https://chat.sirverdata.top/livekit/token';
};

const resolveLiveKitUrl = (): string => {
  const envVal = getEnvVar('VITE_LIVEKIT_URL');
  if (envVal && !envVal.includes('api.sirverdata.top')) {
    return envVal;
  }
  return 'wss://sfu.sirverdata.top';
};

export const ENDPOINTS = {
  /** Main Website Root Domain */
  MAIN_DOMAIN: getEnvVar('VITE_MAIN_DOMAIN') || 'https://sirverdata.top',

  /** PocketBase REST API Base URL */
  API_BASE_URL: getEnvVar('VITE_API_BASE_URL') || getEnvVar('VITE_POCKETBASE_URL') || 'https://api.sirverdata.top',

  /** Chat Server (Go backend) / WebSocket Server URL */
  CHAT_SERVER_URL: getEnvVar('VITE_CHAT_SERVER_URL') || 'wss://chat.sirverdata.top/ws',

  /** LiveKit Token Endpoint (Go backend) */
  LIVEKIT_TOKEN_ENDPOINT: resolveTokenEndpoint(),

  /** LiveKit SFU Realtime Media Server (wss) */
  LIVEKIT_URL: resolveLiveKitUrl(),

  /** Configured allowed origins for CORS validation */
  ALLOWED_ORIGINS: (getEnvVar('ALLOWED_ORIGINS') || getEnvVar('VITE_ALLOWED_ORIGINS') || 'http://tauri.localhost,https://sirverdata.top')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** Default Avatar Placeholder URL */
  UNSPLASH_AVATAR_PLACEHOLDER:
    getEnvVar('VITE_UNSPLASH_AVATAR_PLACEHOLDER') ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',

  /** Font stylesheet URL */
  GOOGLE_FONTS_URL:
    'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Readex+Pro:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Tajawal:wght@400;500;700;800&display=swap',

  /** External Embed Builders */
  EMBEDS: {
    INSTAGRAM: (postId: string) => `https://www.instagram.com/p/${postId}/embed`,
    TIKTOK_PLAYER: (videoId: string) => `https://www.tiktok.com/player/v1/${videoId}?autoplay=0`,
    TIKTOK_EMBED: (videoId?: string, url?: string) =>
      videoId && /^\d+$/.test(videoId)
        ? `https://www.tiktok.com/player/v1/${videoId}?autoplay=0`
        : videoId
        ? `https://www.tiktok.com/embed/v2/${videoId}`
        : `https://www.tiktok.com/embed/v2/?url=${encodeURIComponent(url || '')}`,
    FACEBOOK_VIDEO: (url: string) => `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=0&width=500`,
    FACEBOOK_POST: (url: string) => `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&width=500`,
    REDDIT_COMMENT: (subName: string, commentId: string) =>
      `https://www.redditmedia.com/r/${subName}/comments/${commentId}/?ref_source=embed&amp;ref=share&amp;embed=true`,
    REDDIT_MEDIA: (mediaId: string) => `https://www.redditmedia.com/mediaembed/${mediaId}`,
    REDDIT_GENERIC: (url: string) => `https://www.redditmedia.com/mediaembed/?url=${encodeURIComponent(url)}`,
    YOUTUBE: (ytId: string) => `https://www.youtube.com/embed/${ytId}?enablejsapi=1`,
  },

  /** Resolve WebSocket server connection URL */
  getWebSocketUrl: (protocol?: string, host?: string): string => {
    const customWs = getEnvVar('VITE_WS_URL') || getEnvVar('VITE_CHAT_SERVER_URL');
    if (customWs && (customWs.startsWith('ws://') || customWs.startsWith('wss://'))) {
      return customWs;
    }
    if (typeof window !== 'undefined') {
      const wsHost = host || window.location.host;
      if (wsHost.includes('chat.sirverdata.top')) {
        const wsProto = (protocol || window.location.protocol) === 'https:' ? 'wss:' : 'ws:';
        return `${wsProto}//${wsHost}/ws`;
      }
    }
    return ENDPOINTS.CHAT_SERVER_URL;
  },

  /** Generate standard file download URL from collection, record, and filename */
  getFileUrl: (baseUrl: string, collection: string, recordId: string, filename: string, queryParams?: string): string => {
    if (!filename) return '';
    if (filename.startsWith('data:') || filename.startsWith('blob:') || filename.startsWith('http://') || filename.startsWith('https://')) {
      return filename;
    }
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const fullUrl = `${cleanBase}/api/files/${collection}/${recordId}/${filename}`;
    return queryParams ? `${fullUrl}?${queryParams}` : fullUrl;
  },
} as const;

if (typeof window !== 'undefined') {
  console.log('TOKEN_ENDPOINT =', ENDPOINTS.LIVEKIT_TOKEN_ENDPOINT);
  console.log('LIVEKIT_URL =', ENDPOINTS.LIVEKIT_URL);
}

export default ENDPOINTS;
