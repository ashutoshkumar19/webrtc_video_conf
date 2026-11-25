import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { connectSocket, getSocket } from '@/lib/socket';
import { useStore } from '@/store';
import {
  Video, ShieldCheck, User as UserIcon, Copy, Check, Link as LinkIcon,
  Keyboard, ChevronLeft, ChevronRight, Plus, ChevronDown,
} from 'lucide-react';
import { isValidName } from '@/lib/utils';

const SLIDES = [
  {
    title: 'Get a link you can share',
    description: 'Click New meeting to get a link you can send to people you want to meet with.',
    icon: LinkIcon,
    accent: 'bg-[#8ab4f8]/15 text-[#8ab4f8]',
  },
  {
    title: 'Your meeting is safe',
    description: 'Choose Managed meetings so only people you approve can join the call.',
    icon: ShieldCheck,
    accent: 'bg-[#81c995]/15 text-[#81c995]',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setMeeting, setWaiting, setClientRoomId: storeSetClientRoomId } = useStore();
  const [name, setName] = useState(localStorage.getItem('vc_name') || '');
  const [step, setStep] = useState('home');
  const [meetingType, setMeetingType] = useState('open');
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [createdRoom, setCreatedRoom] = useState(null);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const sock = getSocket() || connectSocket(window.location.origin);

    const onMeetingCreated = (data) => {
      setLoading(false);
      setCreatedRoom(data);
      setRoomId(data.roomId);
      setMeeting(data.roomId, data.type, true, data.me, [data.me]);
      storeSetClientRoomId(data.roomId);
      localStorage.setItem('vc_name', data.me.name);
      setName(data.me.name);
      setStep('created');
    };
    const onMeetingJoined = (data) => {
      setLoading(false);
      setMeeting(data.roomId, data.type, data.isHost, data.me, data.participants);
      storeSetClientRoomId(data.roomId);
      if (data.waiting) setWaiting(data.waiting);
      localStorage.setItem('vc_name', data.me.name);
      setName(data.me.name);
      navigate(`/meeting/${data.roomId}`);
    };
    const onWaitingRoom = (data) => {
      setLoading(false);
      storeSetClientRoomId(data.roomId);
      navigate(`/waiting/${data.roomId}`);
    };
    const onAccessDenied = (data) => {
      setLoading(false);
      toast({ title: 'Access denied', description: data?.message || 'You cannot join this meeting.', variant: 'destructive' });
    };
    const onError = (data) => {
      setLoading(false);
      toast({ title: 'Error', description: data?.message || 'Something went wrong.', variant: 'destructive' });
    };

    sock.on('meeting-created', onMeetingCreated);
    sock.on('meeting-joined', onMeetingJoined);
    sock.on('waiting-room', onWaitingRoom);
    sock.on('access-denied', onAccessDenied);
    sock.on('error', onError);

    return () => {
      sock.off('meeting-created', onMeetingCreated);
      sock.off('meeting-joined', onMeetingJoined);
      sock.off('waiting-room', onWaitingRoom);
      sock.off('access-denied', onAccessDenied);
      sock.off('error', onError);
    };
  }, [navigate, toast, setMeeting, setWaiting, storeSetClientRoomId]);

  const handleCreate = useCallback((type) => {
    setMenuOpen(false);
    if (!isValidName(name)) {
      toast({ title: 'Enter your name', description: 'Please enter a display name before starting a meeting.', variant: 'destructive' });
      return;
    }
    const cleanName = name.trim();
    useStore.getState().setName(cleanName);
    localStorage.setItem('vc_name', cleanName);
    setMeetingType(type);
    setLoading(true);
    try {
      getSocket().emit('create-meeting', { name: cleanName, type });
    } catch {
      setLoading(false);
      toast({ title: 'Error', description: 'Failed to create meeting.', variant: 'destructive' });
    }
  }, [name, toast]);

  const handleJoin = useCallback(() => {
    if (!isValidName(name)) {
      toast({ title: 'Enter your name', description: 'Please enter a display name before joining.', variant: 'destructive' });
      return;
    }
    const raw = joinRoomId.trim();
    if (!raw) {
      toast({ title: 'Invalid meeting code', description: 'Please enter a meeting code or link.', variant: 'destructive' });
      return;
    }
    const cleanName = name.trim();
    useStore.getState().setName(cleanName);
    localStorage.setItem('vc_name', cleanName);
    const extracted = raw.includes('/meeting/') ? raw.split('/meeting/').pop().split(/[?#]/)[0] : raw;
    setLoading(true);
    try {
      getSocket().emit('join-meeting', { roomId: extracted, name: cleanName });
    } catch {
      setLoading(false);
      toast({ title: 'Error', description: 'Failed to join meeting.', variant: 'destructive' });
    }
  }, [name, joinRoomId, toast]);

  const handleEnterCreated = useCallback(() => {
    if (createdRoom) navigate(`/meeting/${createdRoom.roomId}`);
  }, [createdRoom, navigate]);

  const copyRoomId = useCallback(() => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    toast({ title: 'Copied', description: 'Meeting code copied to clipboard.', variant: 'default' });
    setTimeout(() => setCopied(false), 2000);
  }, [roomId, toast]);

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const slide = SLIDES[slideIdx];
  const SlideIcon = slide.icon;

  return (
    <div className="flex min-h-screen flex-col bg-[#202124] text-[#e8eaed]">
      {/* header */}
      <header className="flex items-center justify-between px-6 py-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#1a73e8] flex items-center justify-center text-white shadow-sm">
            <Video className="w-5 h-5" />
          </div>
          <span className="text-[22px] font-normal tracking-tight text-[#e8eaed]">
            Meet
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#9aa0a6]">
          <span>{timeStr}</span>
          <span>•</span>
          <span>{dateStr}</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        {step === 'home' && (
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left hero */}
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-4">
                <h1 className="text-4xl sm:text-[44px] leading-[1.15] font-normal text-[#e8eaed] tracking-tight">
                  Video calls and meetings for everyone
                </h1>
                <p className="text-lg text-[#9aa0a6] max-w-xl">
                  Connect, collaborate, and celebrate from anywhere with real-time HD video, screen sharing, and host controls.
                </p>
              </div>

              {/* Display name */}
              <div className="max-w-sm">
                <label className="block text-xs font-medium text-[#9aa0a6] mb-1.5">
                  Your display name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9aa0a6]" />
                  <input
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#28292c] border border-[#5f6368] text-sm text-[#e8eaed] placeholder-[#9aa0a6] focus:outline-none focus:border-[#8ab4f8] transition-colors"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              {/* New meeting + Join by code row */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#1a73e8] hover:bg-[#1b66c9] disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
                  >
                    <Video className="w-4 h-4" />
                    <span>New meeting</span>
                    <ChevronDown className="w-4 h-4 ml-0.5" />
                  </button>

                  {menuOpen && (
                    <div className="absolute left-0 mt-2 w-72 rounded-xl bg-[#28292c] border border-[#3c4043] shadow-2xl py-1.5 z-50">
                      <button
                        onClick={() => handleCreate('open')}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-[#e8eaed] hover:bg-[#3c4043] transition-colors"
                      >
                        <Plus className="w-4 h-4 text-[#8ab4f8]" />
                        <div>
                          <div className="font-medium">Start an instant meeting</div>
                          <div className="text-xs text-[#9aa0a6]">Anyone with the code can join</div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleCreate('managed')}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-[#e8eaed] hover:bg-[#3c4043] transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4 text-[#81c995]" />
                        <div>
                          <div className="font-medium">Create a managed meeting</div>
                          <div className="text-xs text-[#9aa0a6]">Host approves each participant</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Keyboard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9aa0a6]" />
                    <input
                      className="w-56 sm:w-64 pl-10 pr-4 py-3 rounded-lg bg-transparent border border-[#5f6368] text-sm text-[#e8eaed] placeholder-[#9aa0a6] focus:outline-none focus:border-[#8ab4f8] transition-colors"
                      placeholder="Enter a code or link"
                      value={joinRoomId}
                      onChange={(e) => setJoinRoomId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && joinRoomId.trim()) handleJoin();
                      }}
                    />
                  </div>
                  <button
                    onClick={handleJoin}
                    disabled={loading || !joinRoomId.trim()}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      joinRoomId.trim()
                        ? 'text-[#8ab4f8] hover:bg-[#8ab4f8]/10'
                        : 'text-[#5f6368] cursor-not-allowed'
                    }`}
                  >
                    {loading ? 'Joining…' : 'Join'}
                  </button>
                </div>
              </div>

              <div className="border-t border-[#3c4043] pt-5 text-xs text-[#9aa0a6]">
                End-to-end peer-to-peer WebRTC media • No account required
              </div>
            </div>

            {/* Right carousel */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="w-full max-w-sm flex items-center justify-between gap-2">
                <button
                  onClick={() => setSlideIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#3c4043] transition-colors shrink-0"
                  aria-label="Previous"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="flex flex-col items-center text-center px-2">
                  <div className={`w-44 h-44 rounded-full flex items-center justify-center mb-6 ${slide.accent}`}>
                    <SlideIcon className="w-16 h-16" />
                  </div>
                  <h2 className="text-xl font-normal text-[#e8eaed] mb-2">{slide.title}</h2>
                  <p className="text-sm text-[#9aa0a6] leading-relaxed">{slide.description}</p>
                </div>

                <button
                  onClick={() => setSlideIdx((i) => (i + 1) % SLIDES.length)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#3c4043] transition-colors shrink-0"
                  aria-label="Next"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-2 mt-6">
                {SLIDES.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSlideIdx(idx)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      idx === slideIdx ? 'bg-[#8ab4f8]' : 'bg-[#5f6368]'
                    }`}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'created' && (
          <div className="w-full max-w-md rounded-2xl bg-[#28292c] border border-[#3c4043] p-8 text-center space-y-5 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-[#81c995]/15 text-[#81c995] flex items-center justify-center mx-auto">
              <LinkIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-normal text-[#e8eaed] mb-1">Here&apos;s your joining info</h2>
              <p className="text-sm text-[#9aa0a6]">
                Share this code with people you want in the meeting.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-[#202124] border border-[#3c4043] rounded-xl px-4 py-3">
              <span className="flex-1 text-left font-mono text-base text-[#e8eaed] truncate">
                {roomId}
              </span>
              <button
                onClick={copyRoomId}
                className="w-9 h-9 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#3c4043] transition-colors"
                title="Copy meeting code"
              >
                {copied ? <Check className="w-4 h-4 text-[#81c995]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-[#9aa0a6]">
              {meetingType === 'managed'
                ? 'Managed meeting — you will approve join requests.'
                : 'Open meeting — anyone with the code can join.'}
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={handleEnterCreated}
                disabled={loading}
                className="w-full py-3 rounded-lg bg-[#1a73e8] hover:bg-[#1b66c9] text-white text-sm font-medium transition-colors"
              >
                Join now
              </button>
              <button
                onClick={() => setStep('home')}
                className="py-2 text-sm text-[#8ab4f8] hover:underline"
              >
                Back to home
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
