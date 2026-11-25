import { useCallback } from 'react';
import { MicOff, VideoOff, User, ShieldCheck, Activity, PhoneOff, X, Hand } from 'lucide-react';
import { useStore } from '@/store';
import { initials } from '@/lib/utils';

export default function ParticipantList({ open, onClose, onApprove, onDeny }) {
  const { participants, me, isHost, roomId, waiting, type } = useStore();

  const handleMute = useCallback(
    (targetSocketId, muted) => {
      const sock = useStore.getState().socket;
      if (!sock) return;
      sock.emit('mute-participant', { roomId, targetSocketId, muted });
    },
    [roomId]
  );

  const handleRemove = useCallback(
    (targetSocketId) => {
      const sock = useStore.getState().socket;
      if (!sock) return;
      sock.emit('remove-participant', { roomId, targetSocketId });
    },
    [roomId]
  );

  const approve = (targetSocketId) => {
    if (onApprove) return onApprove(targetSocketId);
    useStore.getState().socket?.emit('approve-participant', { roomId, targetSocketId });
  };

  const deny = (targetSocketId) => {
    if (onDeny) return onDeny(targetSocketId);
    useStore.getState().socket?.emit('deny-participant', { roomId, targetSocketId });
  };

  return (
    <div
      className={`flex h-full flex-col bg-[#202124] border-l border-[#3c4043] ${
        open ? 'w-[360px] flex' : 'w-0 overflow-hidden transition-width duration-300'
      }`}
    >
      <div className="flex items-center justify-between border-b border-[#3c4043] px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-normal text-[#e8eaed]">People</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#3c4043] text-[#e8eaed]">
            {participants.length + 1}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#3c4043] transition-colors"
          aria-label="Close participants"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Self */}
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-[#28292c] border border-[#3c4043]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#5f6368] flex items-center justify-center text-xs font-medium text-white">
              {initials(me?.name || 'U')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium text-[#e8eaed]">
                <span className="truncate">{me?.name} (You)</span>
                {isHost && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#8ab4f8]/20 text-[#8ab4f8]">
                    <ShieldCheck className="w-3 h-3" /> Host
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-[#9aa0a6]">
                <span className="flex items-center gap-1">
                  {me?.cameraOff ? <VideoOff className="w-3 h-3" /> : <User className="w-3 h-3" />}
                  {me?.cameraOff ? 'Camera off' : 'Camera on'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Remote participants */}
        {participants.map((p) => (
          <div
            key={p.socketId}
            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-[#28292c] border border-[#3c4043] hover:bg-[#303134] transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#5f6368] flex items-center justify-center text-xs font-medium text-white">
                {initials(p.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium text-[#e8eaed]">
                  <span className="truncate">{p.name}</span>
                  {p.host && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#8ab4f8]/20 text-[#8ab4f8]">
                      <ShieldCheck className="w-3 h-3" /> Host
                    </span>
                  )}
                  {p.handRaised && (
                    <Hand className="w-3.5 h-3.5 text-[#fdd663] shrink-0" title="Hand raised" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-[#9aa0a6]">
                  <span className="flex items-center gap-1">
                    {p.cameraOff ? <VideoOff className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    {p.cameraOff ? 'Camera off' : 'Camera on'}
                  </span>
                  {p.muted && (
                    <span className="flex items-center gap-1 text-[#f28b82]">
                      <MicOff className="w-3 h-3" /> Muted
                    </span>
                  )}
                  {p.speaking && (
                    <span className="flex items-center gap-1 text-[#8ab4f8]">
                      <Activity className="w-3 h-3 animate-pulse" /> Speaking
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {isHost && p.socketId !== me?.socketId && (
                <>
                  <button
                    onClick={() => handleMute(p.socketId, !p.muted)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#3c4043] transition-colors"
                    aria-label={p.muted ? 'Unmute participant' : 'Mute participant'}
                    title={p.muted ? 'Unmute' : 'Mute'}
                  >
                    <MicOff className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemove(p.socketId)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[#f28b82] hover:bg-[#ea4335]/20 transition-colors"
                    aria-label="Remove participant"
                    title="Remove from call"
                  >
                    <PhoneOff className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {isHost && type === 'managed' && waiting.length > 0 && (
        <div className="border-t border-[#3c4043] p-4 bg-[#28292c]">
          <h4 className="text-xs font-medium text-[#9aa0a6] uppercase tracking-wider mb-3">
            Waiting to join ({waiting.length})
          </h4>
          <div className="space-y-2">
            {waiting.map((w) => (
              <div
                key={w.socketId}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-[#5f6368] bg-[#3c4043]"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#5f6368] flex items-center justify-center text-[10px] font-medium text-white">
                    {initials(w.name)}
                  </div>
                  <span className="text-sm text-[#e8eaed] truncate">{w.name}</span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => approve(w.socketId)}
                    className="px-3 py-1 rounded-full bg-[#8ab4f8] text-[#202124] text-xs font-medium hover:bg-[#aecbfa] transition-colors"
                  >
                    Admit
                  </button>
                  <button
                    onClick={() => deny(w.socketId)}
                    className="px-3 py-1 rounded-full text-[#e8eaed] text-xs font-medium hover:bg-[#5f6368] transition-colors"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
