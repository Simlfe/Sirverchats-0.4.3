import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import ENDPOINTS from './src/config/endpoints';

function parseAllowedOrigins(): Set<string> {
  const envVal = process.env.ALLOWED_ORIGINS || process.env.VITE_ALLOWED_ORIGINS || 'http://tauri.localhost,https://sirverdata.top';
  const list = envVal
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const allowedSet = new Set<string>(list);
  // Guarantee base production origins
  allowedSet.add('http://tauri.localhost');
  allowedSet.add('https://sirverdata.top');
  allowedSet.add(ENDPOINTS.MAIN_DOMAIN);
  allowedSet.add('https://api.sirverdata.top');
  allowedSet.add('https://chat.sirverdata.top');
  return allowedSet;
}

function checkAllowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;

  const allowedSet = parseAllowedOrigins();
  if (allowedSet.has(origin)) {
    return origin;
  }

  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    // Development mode allowed origins:
    // - localhost
    // - 127.0.0.1
    // - AI Studio preview domains (https://*.run.app and https://*.googleusercontent.com)
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
    if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return origin;
    if (/^https:\/\/.*\.run\.app$/.test(origin)) return origin;
    if (/^https:\/\/.*\.googleusercontent\.com$/.test(origin)) return origin;
  }

  return null;
}

function livekitCorsPlugin(): Plugin {
  const handleLiveKitToken = (req: any, res: any, next: () => void) => {
    const url = req.url || '';
    if (!url.startsWith('/livekit/token')) {
      return next();
    }

    const origin = req.headers.origin || '*';
    const matchedOrigin = checkAllowedOrigin(origin) || origin;

    res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          console.log(`[LiveKit Proxy] Proxying token request to ${ENDPOINTS.LIVEKIT_TOKEN_ENDPOINT}`);
          const tokenRes = await fetch(ENDPOINTS.LIVEKIT_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
            },
            body: body || '{}',
          });

          const status = tokenRes.status;
          const data = await tokenRes.text();

          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(data);
        } catch (err: any) {
          console.error('[LiveKit CORS Middleware] Error proxying token request:', err);
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Failed to reach LiveKit token endpoint' }));
        }
      });
      return;
    }

    next();
  };

  return {
    name: 'livekit-cors-plugin',
    configureServer(server) {
      server.middlewares.use(handleLiveKitToken);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleLiveKitToken);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), livekitCorsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
