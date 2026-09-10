import React, { useMemo } from 'react';
import { Phone, PhoneOff, Video, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Avatar from './Avatar';
import useRealtimeMedia from '../context/MediaContext';
import { getServerMemberAvatarUrl, pbService } from '../pocketbase';

export const IncomingCallModal: React.FC = () => {
  const { incomingCall, acceptCall, declineCall } = useRealtimeMedia();

  const callerAvatarUrl = useMemo(() => {
    if (!incomingCall) return '';
    if (incomingCall.callerAvatar) {
      if (
        incomingCall.callerAvatar.startsWith('http') ||
        incomingCall.callerAvatar.startsWith('blob:') ||
        incomingCall.callerAvatar.startsWith('data:')
      ) {
        return incomingCall.callerAvatar;
      }
      return `${pbService.getServerUrl()}/api/files/users/${incomingCall.callerId}/${incomingCall.callerAvatar}`;
    }
    if (incomingCall.callerUser) {
      return getServerMemberAvatarUrl(null, incomingCall.callerUser, undefined);
    }
    return '';
  }, [incomingCall]);

  if (!incomingCall) return null;

  const isVideo = incomingCall.callType === 'video';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -30, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="fixed top-6 left-1/2 -translate-x-1/2 z-[100000] w-[92%] max-w-md p-4 rounded-2xl shadow-2xl border bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] select-none"
      >
        <div className="flex items-center gap-4">
          {/* Animated pulsing caller avatar */}
          <div className="relative shrink-0">
            <div className="absolute -inset-2 rounded-full bg-accent/20 animate-ping opacity-75" />
            <Avatar
              src={callerAvatarUrl}
              username={incomingCall.callerName}
              size="lg"
              className="relative border-2 border-accent shadow-md"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-accent uppercase tracking-wider">
              {isVideo ? <Video className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{isVideo ? 'Incoming Video Call' : 'Incoming Voice Call'}</span>
            </div>
            <h4 className="text-base font-bold truncate text-[var(--theme-text-primary)] mt-0.5">
              {incomingCall.callerName}
            </h4>
            <p className="text-xs text-[var(--theme-text-muted)] truncate">
              @{incomingCall.callerUser.username}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={declineCall}
              className="p-3 rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-500 transition-all border border-red-500/30 active:scale-95 cursor-pointer"
              title="Decline Call"
            >
              <PhoneOff className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={acceptCall}
              className="p-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 transition-all active:scale-95 cursor-pointer animate-bounce"
              title="Accept Call"
            >
              <Phone className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default IncomingCallModal;
