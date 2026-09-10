import { pbService } from '../pocketbase';

export interface CallLogData {
  type: 'voice' | 'video';
  status: 'ended' | 'missed' | 'declined' | 'cancelled';
  duration: number; // in seconds
  callerId?: string;
  callerName?: string;
  targetUserId?: string;
  timestamp?: number;
}

const loggedCallMap = new Set<string>();

/**
 * Persists a structured call log message to the DM conversation in PocketBase.
 */
export async function recordCallLog(params: {
  callId: string;
  conversationId: string;
  targetUserId: string;
  callerId: string;
  callerName: string;
  callType: 'voice' | 'video';
  status: 'ended' | 'missed' | 'declined' | 'cancelled';
  duration: number;
}) {
  if (!params.callId) return;
  const logKey = `${params.callId}_${params.status}`;
  if (loggedCallMap.has(logKey)) {
    return;
  }
  loggedCallMap.add(logKey);

  const payload: CallLogData = {
    type: params.callType || 'voice',
    status: params.status,
    duration: Math.max(0, Math.round(params.duration || 0)),
    callerId: params.callerId,
    callerName: params.callerName,
    targetUserId: params.targetUserId,
    timestamp: Date.now(),
  };

  const content = `[CALL_LOG:${JSON.stringify(payload)}]`;

  try {
    const currentUserId = pbService.getCurrentUser()?.id;
    // Determine the other party for direct message routing
    const otherUserId = currentUserId === params.callerId ? params.targetUserId : params.callerId;

    if (otherUserId) {
      const privateChatServer = await pbService.getOrCreatePrivateChatServer(otherUserId).catch(() => null);
      await pbService.sendDirectMessage(
        otherUserId,
        content,
        undefined,
        privateChatServer?.id
      );
    } else if (params.conversationId && !params.conversationId.startsWith('dm-user-')) {
      await pbService.sendMessage(params.conversationId, content);
    }
  } catch (err) {
    console.warn('[CALL_LOG] Could not record call log into conversation:', err);
  }
}

/**
 * Checks if a message string is a serialized call log and parses it.
 */
export function parseCallLog(content: string): CallLogData | null {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();

  // 1. Direct standard bracket format
  if (trimmed.startsWith('[CALL_LOG:') && trimmed.endsWith(']')) {
    try {
      const jsonStr = trimmed.slice(10, -1).trim();
      const data = JSON.parse(jsonStr) as CallLogData;
      if (data && (data.type === 'voice' || data.type === 'video')) {
        return {
          ...data,
          status: data.status || 'ended',
          duration: data.duration || 0,
        };
      }
    } catch {}
  }

  // 2. Generic regex match for [CALL_LOG:{...}] or CALL_LOG:{...}
  const callLogMatch = trimmed.match(/(?:\[?CALL_LOG:)\s*(\{[\s\S]*?\})\s*\]?/i);
  if (callLogMatch && callLogMatch[1]) {
    try {
      const data = JSON.parse(callLogMatch[1]);
      if (data) {
        return {
          type: data.type === 'video' || data.callType === 'video' ? 'video' : 'voice',
          status: data.status || 'ended',
          duration: Number(data.duration) || 0,
          callerId: data.callerId,
          callerName: data.callerName,
          targetUserId: data.targetUserId,
          timestamp: data.timestamp || Date.now(),
        };
      }
    } catch {}
  }

  // 3. Match INCOMING_CALL:{...} payload if present in message content
  const incomingMatch = trimmed.match(/(?:INCOMING_CALL:)\s*(\{[\s\S]*?\})/i);
  if (incomingMatch && incomingMatch[1]) {
    try {
      const data = JSON.parse(incomingMatch[1]);
      if (data) {
        return {
          type: data.callType === 'video' ? 'video' : 'voice',
          status: data.state === 'ringing' ? 'missed' : (data.state || 'ended'),
          duration: 0,
          callerId: data.callerId,
          callerName: data.callerName,
          targetUserId: data.targetUserId,
          timestamp: data.timestamp || Date.now(),
        };
      }
    } catch {}
  }

  // 4. Catch any remaining raw call log string signature so code is NEVER exposed
  if (trimmed.includes('CALL_LOG:') || trimmed.includes('INCOMING_CALL:')) {
    return {
      type: trimmed.toLowerCase().includes('video') ? 'video' : 'voice',
      status: trimmed.toLowerCase().includes('missed')
        ? 'missed'
        : trimmed.toLowerCase().includes('declined')
        ? 'declined'
        : trimmed.toLowerCase().includes('cancel')
        ? 'cancelled'
        : 'ended',
      duration: 0,
    };
  }

  return null;
}

/**
 * Returns a human-friendly label for a message snippet or preview if it's a call log.
 */
export function getCallLogSnippet(content: string, lang: string = 'en'): string | null {
  const log = parseCallLog(content);
  if (!log) return null;
  const isAr = lang === 'ar';
  const isVideo = log.type === 'video';
  if (log.status === 'missed') {
    return isAr ? (isVideo ? '📹 مكالمة فيديو فائتة' : '📞 مكالمة صوتية فائتة') : (isVideo ? '📹 Missed Video Call' : '📞 Missed Voice Call');
  }
  if (log.status === 'declined') {
    return isAr ? (isVideo ? '📹 مكالمة فيديو مرفوضة' : '📞 مكالمة صوتية مرفوضة') : (isVideo ? '📹 Declined Video Call' : '📞 Declined Voice Call');
  }
  if (log.status === 'cancelled') {
    return isAr ? (isVideo ? '📹 مكالمة فيديو ملغاة' : '📞 مكالمة صوتية ملغاة') : (isVideo ? '📹 Cancelled Video Call' : '📞 Cancelled Voice Call');
  }
  const durStr = log.duration > 0 ? ` (${formatCallDuration(log.duration)})` : '';
  return isAr ? (isVideo ? `📹 مكالمة فيديو${durStr}` : `📞 مكالمة صوتية${durStr}`) : (isVideo ? `📹 Video Call${durStr}` : `📞 Voice Call${durStr}`);
}

/**
 * Formats duration in seconds to mm:ss or hh:mm:ss
 */
export function formatCallDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
