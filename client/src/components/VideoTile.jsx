import { useEffect, useRef } from 'react';
import { MicOff, VideoOff, Pin, PinOff, Hand } from 'lucide-react';
import { initials } from '@/lib/utils';

export default function VideoTile({
  socketId,
  name,
  host = false,
  muted = false,
  cameraOff = false,
  speaking = false,
  handRaised = false,
  pinned = false,
  onPin,
  stream,
  isLocal = false,
  isScreenSharing = false,
  localStream,
}) {
  const videoRef = useRef(null);

  const hasLocalVideo = localStream ? localStream.getVideoTracks().length > 0 : false;
  const hasRemoteVideo = stream ? stream.getVideoTracks().length > 0 : false;

  const showPlaceholder = isLocal
    ? (!hasLocalVideo || cameraOff)
    : (!stream || !hasRemoteVideo || cameraOff);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const targetStream = isLocal ? localStream : stream;

    if (targetStream && (isLocal ? hasLocalVideo : hasRemoteVideo)) {
      el.srcObject = targetStream;
      targetStream.getVideoTracks().forEach((track) => {
        track.enabled = !cameraOff;
      });
      const playPromise = el.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } else {
      el.srcObject = null;
    }
  }, [isLocal, localStream, stream, cameraOff, hasLocalVideo, hasRemoteVideo]);

  return (
    <div
      className={`group relative w-full h-full rounded-xl overflow-hidden bg-[#3c4043] transition-all duration-200 ${
        speaking ? 'ring-2 ring-[#8ab4f8] ring-offset-2 ring-offset-[#202124]' : ''
      }`}
    >
      {showPlaceholder ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#3c4043]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full bg-[#5f6368] flex items-center justify-center text-white text-3xl font-medium select-none">
              {initials(name) || '?'}
            </div>
            {cameraOff && <VideoOff className="w-5 h-5 text-[#9aa0a6]" />}
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${
            isLocal && !isScreenSharing ? 'scale-x-[-1]' : ''
          }`}
        />
      )}

      {/* Top-left: Raised hand badge */}
      {handRaised && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#fdd663] text-[#202124] text-xs font-medium shadow-md">
          <Hand className="w-3.5 h-3.5" />
          <span>Hand raised</span>
        </div>
      )}

      {/* Top-right: Pin / Unpin button on hover (or when pinned) */}
      {onPin && (
        <button
          onClick={() => onPin(socketId)}
          title={pinned ? 'Unpin' : 'Pin to screen'}
          className={`absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center bg-black/50 text-white hover:bg-black/70 transition-opacity ${
            pinned ? 'opacity-100 bg-[#8ab4f8] text-[#202124] hover:bg-[#aecbfa]' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
        </button>
      )}

      {/* Bottom: Name + status overlay */}
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 py-2.5 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 min-w-0">
          {muted && (
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#ea4335] shrink-0">
              <MicOff className="w-3.5 h-3.5 text-white" />
            </div>
          )}
          <span className="text-sm font-medium text-white truncate drop-shadow-md">
            {name}
            {isLocal && ' (You)'}
          </span>
          {host && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#8ab4f8]/20 text-[#8ab4f8] font-medium shrink-0">
              Host
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
