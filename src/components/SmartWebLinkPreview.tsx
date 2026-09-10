import React, { useState, useEffect } from "react";
import { Globe, ExternalLink, ShieldCheck, Loader2 } from "lucide-react";
import { openExternalUrl } from "../lib/tauriDesktopService";

interface SmartWebLinkPreviewProps {
  url: string;
  lang?: string;
  isLight?: boolean;
}

export interface LinkPreviewData {
  url: string;
  domain: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  faviconUrl?: string;
  timestamp: number;
}

// Global in-memory cache to prevent duplicate requests across renders and switches
const memoryPreviewCache = new Map<string, LinkPreviewData>();

const loadCachedPreview = (targetUrl: string): LinkPreviewData | null => {
  if (memoryPreviewCache.has(targetUrl)) {
    return memoryPreviewCache.get(targetUrl)!;
  }
  try {
    const raw = sessionStorage.getItem(`link_preview_${encodeURIComponent(targetUrl)}`);
    if (raw) {
      const parsed: LinkPreviewData = JSON.parse(raw);
      memoryPreviewCache.set(targetUrl, parsed);
      return parsed;
    }
  } catch {}
  return null;
};

const saveCachedPreview = (targetUrl: string, data: LinkPreviewData) => {
  memoryPreviewCache.set(targetUrl, data);
  try {
    sessionStorage.setItem(`link_preview_${encodeURIComponent(targetUrl)}`, JSON.stringify(data));
  } catch {}
};

async function fetchLinkMetadata(rawUrl: string): Promise<LinkPreviewData> {
  const normalizedUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  let host = "";
  try {
    const u = new URL(normalizedUrl);
    host = u.hostname.replace(/^www\./, "");
  } catch {
    host = rawUrl;
  }

  const defaultFavicon = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  const cleanTitle =
    host
      .split(".")
      .slice(0, -1)
      .join(" ")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) || host;

  const fallbackData: LinkPreviewData = {
    url: normalizedUrl,
    domain: host,
    title: cleanTitle,
    faviconUrl: defaultFavicon,
    timestamp: Date.now(),
  };

  // Asynchronous Microlink metadata fetch with 3.5s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(normalizedUrl)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      if (json.status === "success" && json.data) {
        const d = json.data;
        const fetchedTitle = typeof d.title === "string" && d.title.trim() ? d.title.trim() : cleanTitle;
        const fetchedDesc =
          typeof d.description === "string" && d.description.trim() ? d.description.trim() : undefined;
        const fetchedImg =
          typeof d.image?.url === "string" && d.image.url.trim() ? d.image.url.trim() : undefined;
        const fetchedLogo =
          typeof d.logo?.url === "string" && d.logo.url.trim() ? d.logo.url.trim() : defaultFavicon;
        const fetchedPublisher =
          typeof d.publisher === "string" && d.publisher.trim() ? d.publisher.trim() : host;

        return {
          url: normalizedUrl,
          domain: fetchedPublisher || host,
          title: fetchedTitle,
          description: fetchedDesc,
          image: fetchedImg,
          siteName: fetchedPublisher || host,
          faviconUrl: fetchedLogo,
          timestamp: Date.now(),
        };
      }
    }
  } catch {
    // Timeout or network failure fallback
  }

  return fallbackData;
}

export const SmartWebLinkPreview: React.FC<SmartWebLinkPreviewProps> = React.memo(({
  url,
  lang = "en",
  isLight = false,
}) => {
  const [data, setData] = useState<LinkPreviewData | null>(() => loadCachedPreview(url));
  const [loading, setLoading] = useState<boolean>(() => !loadCachedPreview(url));
  const [imgError, setImgError] = useState<boolean>(false);
  const [faviconError, setFaviconError] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const cached = loadCachedPreview(url);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    setLoading(true);

    const runFetch = () => {
      fetchLinkMetadata(url).then((res) => {
        if (!active) return;
        saveCachedPreview(url, res);
        setData(res);
        setLoading(false);
      });
    };

    let timer: any = null;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const handle = (window as any).requestIdleCallback(runFetch, { timeout: 1500 });
      return () => {
        active = false;
        if (typeof window !== "undefined" && "cancelIdleCallback" in window) {
          (window as any).cancelIdleCallback(handle);
        }
      };
    } else {
      timer = setTimeout(runFetch, 100);
      return () => {
        active = false;
        if (timer) clearTimeout(timer);
      };
    }
  }, [url]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openExternalUrl(url);
  };

  const domainDisplay = data?.domain || url;
  const titleDisplay = data?.title || domainDisplay;

  return (
    <div
      onClick={handleOpen}
      className="group w-full max-w-md rounded-2xl p-3 border shadow-md my-1.5 flex flex-col gap-2 relative overflow-hidden transition-all cursor-pointer bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] hover:border-accent/40"
    >
      {/* Top Domain & Badge Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)] pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {!faviconError && data?.faviconUrl ? (
            <img
              src={data.faviconUrl}
              alt=""
              className="w-4 h-4 rounded-xs shrink-0 object-contain bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]"
              loading="lazy"
              decoding="async"
              onError={() => setFaviconError(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
            <Globe className="w-4 h-4 text-accent shrink-0" />
          )}
          <span className="text-xs font-bold text-[var(--theme-text-secondary)] truncate">
            {domainDisplay}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
          {loading ? (
            <Loader2 className="w-3 h-3 text-accent animate-spin" />
          ) : (
            <ShieldCheck className="w-3 h-3 text-accent" />
          )}
          <span>{lang === "ar" ? "معاينة رابط" : "Link Preview"}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col gap-2">
        {/* Preview Image if available */}
        {data?.image && !imgError && (
          <div className="w-full h-40 sm:h-44 rounded-xl overflow-hidden bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] relative shrink-0">
            <img
              src={data.image}
              alt=""
              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <span className="text-xs sm:text-sm font-extrabold text-[var(--theme-text-primary)] group-hover:text-accent transition-colors line-clamp-2 leading-snug">
              {titleDisplay}
            </span>
            {data?.description && (
              <p className="text-[11px] text-[var(--theme-text-muted)] line-clamp-2 leading-relaxed">
                {data.description}
              </p>
            )}
            <span className="text-[10px] font-mono text-[var(--theme-text-muted)] truncate opacity-80 pt-0.5">
              {data?.url || url}
            </span>
          </div>

          <button
            type="button"
            onClick={handleOpen}
            className="p-2 rounded-xl bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 transition-all shrink-0 cursor-pointer active:scale-95 self-center"
            title={lang === "ar" ? "فتح الرابط" : "Open Link"}
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
