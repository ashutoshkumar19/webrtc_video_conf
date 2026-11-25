import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  Mic, MicOff, Video, VideoOff, Share, Share2, Users, MessageCircle,
  LogOut, Activity, User, Phone, Hand, Smile, Copy, Check,
} from 'lucide-react';
import { useStore } from '@/store';
import { connectSocket, getSocket, getClientRoomId, setClientRoomId } from '@/lib/socket';
import { getMedia, setTrackEnabled, stopStream, isDeviceAccessDenied } from '@/lib/media';
import { getWebRTC, resetWebRTC } from '@/lib/webrtc';
import { initials } from '@/lib/utils';
import VideoTile from './VideoTile';
import ChatSidebar from './ChatSidebar';
import ParticipantList from './ParticipantList';

export default function Meeting() {
  const navigate = useNavigate();
  const { roomId: roomIdParam } = useParams();
  const { toast } = useToast();

  const {
    name, setName,
    socket, setSocket, setConnected, setConnectionStatus,
    setMeeting, setIsHost, setType, endMeeting, setAccessDenied,
    participants, setParticipants, addParticipant, removeParticipant, updateParticipant,
    waiting, setWaiting,
    localStream, setLocalStream,
    audioEnabled, setAudioEnabled,
    videoEnabled, setVideoEnabled,
    micPermissionDenied, setMicPermissionDenied,
    camPermissionDenied, setCamPermissionDenied,
    mediaError, setMediaError,
    remoteStreams, setRemoteStream, removeRemoteStream,
    setChatOpen, setParticipantsOpen,
    chatOpen, participantsOpen,
    reset,
    setMessages, clearMessages,
    clearRemoteStreams,
    clientRoomId,
    setClientRoomId: storeSetClientRoomId,
  } = useStore();

  const [speakerId, setSpeakerId] = useState(null);
  const [gridCols, setGridCols] = useState(2);
  const [screenSharing, setScreenSharing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [handRaised, setHandRaised] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [pinnedSocketId, setPinnedSocketId] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const audioCtxRef = useRef(null);
  const analysersRef = useRef(new Map());
  const rafRef = useRef(null);
  const screenTrackRef = useRef(null);
  const cameraVideoTrackRef = useRef(null);
  const mySocketIdRef = useRef(null);
  const currentRoomRef = useRef(null);
  const mgrRef = useRef(null);
  const mediaInitRef = useRef(false);
  const mountRef = useRef(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  useEffect(() => {
    const count = participants.length + 1;
    if (count <= 1) setGridCols(1);
    else if (count === 2) setGridCols(2);
    else if (count <= 4) setGridCols(2);
    else if (count <= 6) setGridCols(3);
    else if (count <= 9) setGridCols(3);
    else setGridCols(4);
  }, [participants.length]);

  // ---- Speaker detection ----
  const startSpeakerDetection = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const analyse = (stream, socketId) => {
      if (!stream) return;
      const existing = analysersRef.current.get(socketId);
      if (existing) {
        existing.source.mediaStream = stream;
        return;
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analysersRef.current.set(socketId, { analyser, source });
    };

    if (localStream) analyse(localStream, 'self');
    Object.keys(remoteStreams).forEach((id) => {
      analyse(remoteStreams[id], id);
    });

    const loop = () => {
      if (!mountRef.current) return;
      let loudest = null;
      let max = 0;
      analysersRef.current.forEach(({ analyser }, socketId) => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        if (avg > max) { max = avg; loudest = socketId; }
      });
      const speaking = max > 40;
      setSpeakerId(speaking && loudest !== 'self' ? loudest : null);
      const sock = getSocket();
      if (sock && mySocketIdRef.current) {
        sock.emit('speaker-update', {
          roomId: useStore.getState().roomId,
          speaking: speaking && loudest === 'self',
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      mountRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      analysersRef.current.forEach(({ source }) => { try { source.disconnect(); } catch (_) {} });
      analysersRef.current.clear();
    };
  }, [localStream, remoteStreams]);

  // ---- Init media with timeout for permission dialog ----
  const initMedia = async (room, meetingType, host, displayName, existing) => {
    if (mediaInitRef.current) return;
    mediaInitRef.current = true;

    let stream = null;
    let permErr = null;

    try {
      // Timeout the getUserMedia call so we don't hang forever on permission dialog
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PERMISSION_TIMEOUT')), 10000)
      );
      stream = await Promise.race([getMedia(true, true), timeoutPromise]);
    } catch (err) {
      permErr = err;
    }

    if (!stream && permErr) {
      setMediaError(permErr.message || 'Media access failed');
      if (isDeviceAccessDenied(permErr)) {
        setMicPermissionDenied(true);
        setCamPermissionDenied(true);
      }
      // Continue without media - user can still join
      setLocalStream(null);
      const mgr = getWebRTC();
      mgrRef.current = mgr;
      mgr.setHandlers({
        onTrack: (socketId, remoteStream) => {
          const existing = useStore.getState().remoteStreams[socketId];
          if (existing) {
            remoteStream.getTracks().forEach((track) => {
              existing.addTrack(track);
            });
            setRemoteStream(socketId, existing);
          } else {
            setRemoteStream(socketId, remoteStream);
          }
        },
        onPeerClose: (socketId) => {
          removeRemoteStream(socketId);
          removeParticipant(socketId);
        },
      });
      currentRoomRef.current = room;
      existing.forEach((p) => {
        if (p.socketId !== mySocketIdRef.current) mgr.createOffer(p.socketId, null);
      });
      startSpeakerDetection();
      setJoining(false);
      return;
    }

    setLocalStream(stream);
    setMicPermissionDenied(false);
    setCamPermissionDenied(false);
    setMediaError(null);
    setVideoEnabled(true);

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      cameraVideoTrackRef.current = videoTrack;
      videoTrack.enabled = true;
    }

    const mgr = getWebRTC();
    mgrRef.current = mgr;
    mgr.setHandlers({
      onTrack: (socketId, remoteStream) => {
        const existing = useStore.getState().remoteStreams[socketId];
        if (existing) {
          remoteStream.getTracks().forEach((track) => {
            existing.addTrack(track);
          });
          setRemoteStream(socketId, existing);
        } else {
          setRemoteStream(socketId, remoteStream);
        }
      },
      onPeerClose: (socketId) => {
        removeRemoteStream(socketId);
        removeParticipant(socketId);
      },
    });
    currentRoomRef.current = room;

    existing.forEach((p) => {
      if (p.socketId !== mySocketIdRef.current) mgr.createOffer(p.socketId, stream);
    });

    startSpeakerDetection();
    setJoining(false);
  };

  // ---- Socket + join (stable subscription) ----
  useEffect(() => {
    if (!roomIdParam) return;
    const sock = getSocket() || connectSocket(window.location.origin);
    setSocket(sock);
    setConnectionStatus('connecting');

    const storedName = name || localStorage.getItem('vc_name') || '';
    if (storedName) setName(storedName);

    const onConnect = () => {
      setConnected(true);
      setConnectionStatus('connected');
    };

    const onDisconnect = () => {
      setConnected(false);
      setConnectionStatus('disconnected');
      toast({ title: 'Disconnected', description: 'Lost connection to the server. Reconnecting…', variant: 'destructive' });
    };

    const onError = (data) => {
      setConnectionStatus('error');
      toast({ title: 'Error', description: data && data.message ? data.message : 'Connection error', variant: 'destructive' });
    };

    const onAccessDenied = (data) => {
      setAccessDenied(true, data && data.message ? data.message : 'Access denied');
      toast({ title: 'Access denied', description: data && data.message ? data.message : '', variant: 'destructive' });
      setJoining(false);
    };

    const onMeetingJoined = (data) => {
      currentRoomRef.current = data.roomId;
      mySocketIdRef.current = data.me.socketId;
      setClientRoomId(data.roomId);
      storeSetClientRoomId(data.roomId);
      setMeeting(data.roomId, data.type, data.isHost, data.me, data.participants);
      setParticipants(data.participants);
      if (data.waiting) setWaiting(data.waiting);
      clearRemoteStreams();
      localStorage.setItem('vc_name', data.me.name);
      setName(data.me.name);
      setJoining(false);
      initMedia(data.roomId, data.type, data.isHost, data.me.name, data.participants);
    };

    const onAdmitted = (data) => {
      currentRoomRef.current = data.roomId;
      mySocketIdRef.current = data.me.socketId;
      setClientRoomId(data.roomId);
      storeSetClientRoomId(data.roomId);
      setMeeting(data.roomId, data.type, data.isHost, data.me, data.participants);
      setParticipants(data.participants);
      clearRemoteStreams();
      localStorage.setItem('vc_name', data.me.name);
      setName(data.me.name);
      setJoining(false);
      initMedia(data.roomId, data.type, data.isHost, data.me.name, data.participants);
    };

    const onParticipantJoined = (p) => {
      addParticipant(p);
      toast({ title: `${p.name} joined`, variant: 'default' });
      // Do NOT create offer here — the new participant initiates offers to all
      // existing participants via initMedia. Existing participants answer via
      // handleOffer when they receive the new participant's offer.
    };

    const onParticipantLeft = (p) => {
      removeParticipant(p.socketId);
      removeRemoteStream(p.socketId);
      const mgr = getWebRTC();
      if (mgr) mgr.closePeer(p.socketId);
    };

    const onParticipantUpdated = (u) => {
      updateParticipant(u.socketId, { muted: u.muted, cameraOff: u.cameraOff, speaking: u.speaking });
      if (u.socketId === mySocketIdRef.current) {
        setAudioEnabled(!u.muted);
        setVideoEnabled(!u.cameraOff);
      }
    };

    const onParticipantMuted = (m) => {
      if (m.targetSocketId === mySocketIdRef.current) {
        setAudioEnabled(false);
        setTrackEnabled(localStream, 'audio', false);
      }
      updateParticipant(m.targetSocketId, { muted: m.muted });
    };

    const onYouMuted = (m) => {
      setAudioEnabled(!m.muted);
      setTrackEnabled(localStream, 'audio', !m.muted);
    };

    const onYouRemoved = () => {
      toast({ title: 'Removed', description: 'You have been removed from the meeting.', variant: 'destructive' });
      leaveMeeting();
    };

    const onParticipantRemoved = (p) => {
      removeParticipant(p.targetSocketId);
      removeRemoteStream(p.targetSocketId);
      const mgr = getWebRTC();
      if (mgr) mgr.closePeer(p.targetSocketId);
      toast({ title: 'Participant removed', description: `${p.targetName} was removed by the host.`, variant: 'default' });
    };

    const onHostChanged = (h) => {
      setIsHost(h.newHostId === mySocketIdRef.current);
      updateParticipant(h.newHostId, { host: true });
      updateParticipant(h.by, { host: false });
      toast({ title: 'New host', description: `${h.newHostName} is now the host.`, variant: 'default' });
    };

    const onMeetingEnded = () => {
      endMeeting();
      toast({ title: 'Meeting ended', description: 'The host left and the meeting has ended.', variant: 'destructive' });
      setJoining(false);
      setTimeout(() => leaveMeeting(), 1500);
    };

    const onJoinRequest = (req) => {
      setWaiting(req.waiting);
      setJoinRequests((prev) => {
        const filtered = prev.filter((r) => r.socketId !== req.socketId);
        return [...filtered, { socketId: req.socketId, name: req.name }];
      });
    };

  const onJoinRequestHandled = (req) => {
    setWaiting(req.waiting);
    setJoinRequests((prev) => prev.filter((r) => r.socketId !== req.socketId));
  };

  const onWebRtcSignal = async (sig) => {
      const mgr = getWebRTC();
      if (!mgr) return;
      const { from, type, payload } = sig;
      const currentLocalStream = useStore.getState().localStream;
      if (type === 'offer') await mgr.handleOffer(from, payload, currentLocalStream);
      else if (type === 'answer') await mgr.handleAnswer(from, payload);
      else if (type === 'ice-candidate') await mgr.handleIceCandidate(from, payload);
    };

    const onChatMessage = (msg) => {
      const own = msg.from === mySocketIdRef.current;
      if (!own && !useStore.getState().chatOpen) {
        setUnreadCount((c) => c + 1);
      }
      if (own && msg.tempId) {
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => !(m.tempId === msg.tempId));
          return [...withoutTemp, { ...msg, own }];
        });
      } else {
        setMessages((prev) => [...prev, { ...msg, own }]);
      }
    };

    const onHandRaised = ({ socketId, name: who, raised }) => {
      if (socketId === mySocketIdRef.current) {
        setHandRaised(raised);
      } else {
        updateParticipant(socketId, { handRaised: raised });
        if (raised) {
          toast({ title: 'Hand raised', description: `${who} raised their hand.`, variant: 'default' });
        }
      }
    };

    const onReaction = (r) => {
      setReactions((prev) => [...prev.slice(-14), r]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((item) => item.id !== r.id));
      }, 3000);
    };

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.on('error', onError);
    sock.on('access-denied', onAccessDenied);
    sock.on('meeting-joined', onMeetingJoined);
    sock.on('admitted', onAdmitted);
    sock.on('participant-joined', onParticipantJoined);
    sock.on('participant-left', onParticipantLeft);
    sock.on('participant-updated', onParticipantUpdated);
    sock.on('participant-muted', onParticipantMuted);
    sock.on('you-muted', onYouMuted);
    sock.on('you-removed', onYouRemoved);
    sock.on('participant-removed', onParticipantRemoved);
    sock.on('host-changed', onHostChanged);
    sock.on('meeting-ended', onMeetingEnded);
    sock.on('join-request', onJoinRequest);
    sock.on('join-request-handled', onJoinRequestHandled);
    sock.on('webrtc-signal', onWebRtcSignal);
    sock.on('chat-message', onChatMessage);
    sock.on('hand-raised', onHandRaised);
    sock.on('reaction', onReaction);

    mySocketIdRef.current = sock.id;

    // Decide whether to join or resume existing room
    const alreadyInRoom = clientRoomId === roomIdParam;

    if (!alreadyInRoom) {
      setJoining(true);
      const displayName = name || localStorage.getItem('vc_name') || 'Guest';
      sock.emit('join-meeting', { roomId: roomIdParam, name: displayName });
    } else {
      const store = useStore.getState();
      initMedia(
        clientRoomId || roomIdParam,
        store.type,
        store.isHost,
        store.name,
        store.participants
      );
    }

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.off('error', onError);
      sock.off('access-denied', onAccessDenied);
      sock.off('meeting-joined', onMeetingJoined);
      sock.off('admitted', onAdmitted);
      sock.off('participant-joined', onParticipantJoined);
      sock.off('participant-left', onParticipantLeft);
      sock.off('participant-updated', onParticipantUpdated);
      sock.off('participant-muted', onParticipantMuted);
      sock.off('you-muted', onYouMuted);
      sock.off('you-removed', onYouRemoved);
      sock.off('participant-removed', onParticipantRemoved);
      sock.off('host-changed', onHostChanged);
      sock.off('meeting-ended', onMeetingEnded);
      sock.off('join-request', onJoinRequest);
      sock.off('join-request-handled', onJoinRequestHandled);
      sock.off('webrtc-signal', onWebRtcSignal);
      sock.off('chat-message', onChatMessage);
      sock.off('hand-raised', onHandRaised);
      sock.off('reaction', onReaction);
    };
  }, [roomIdParam, clientRoomId]);

  // ---- Media toggles ----
  const toggleAudio = useCallback(() => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    setTrackEnabled(localStream, 'audio', next);
    getSocket()?.emit('participant-update', {
      roomId: useStore.getState().roomId,
      muted: !next,
    });
  }, [audioEnabled, localStream]);

  const toggleVideo = useCallback(() => {
    const next = !videoEnabled;
    setVideoEnabled(next);
    setTrackEnabled(localStream, 'video', next);
    getSocket()?.emit('participant-update', {
      roomId: useStore.getState().roomId,
      cameraOff: !next,
    });
  }, [videoEnabled, localStream]);

  // ---- Screen sharing ----
  const stopScreenShare = useCallback(() => {
    const mgr = mgrRef.current || getWebRTC();
    const currentLocal = useStore.getState().localStream;
    if (cameraVideoTrackRef.current) {
      const combined = new MediaStream([
        ...(currentLocal?.getAudioTracks() || []),
        cameraVideoTrackRef.current,
      ]);
      setLocalStream(combined);
      mgr?.pcs?.forEach((pc, socketId) => {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          sender.replaceTrack(cameraVideoTrackRef.current).then(() => mgr.createOffer(socketId, combined));
        }
      });
    } else {
      const audioOnly = new MediaStream(currentLocal?.getAudioTracks() || []);
      setLocalStream(audioOnly);
    }
    setScreenSharing(false);
    if (screenTrackRef.current) {
      try { screenTrackRef.current.stop(); } catch (_) {}
      screenTrackRef.current = null;
    }
  }, [setLocalStream]);

  const toggleScreenShare = async () => {
    const mgr = mgrRef.current || getWebRTC();
    if (!screenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        if (!screenTrack) return;
        screenTrackRef.current = screenTrack;
        screenTrack.addEventListener('ended', stopScreenShare);
        const combined = new MediaStream([
          ...(localStream?.getAudioTracks() || []),
          screenTrack,
        ]);
        setLocalStream(combined);
        setScreenSharing(true);
        setTrackEnabled(combined, 'audio', audioEnabled);
        mgr?.pcs?.forEach((pc, socketId) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack).then(() => mgr.createOffer(socketId, combined));
          } else {
            pc.addTrack(screenTrack, combined);
            mgr.createOffer(socketId, combined);
          }
        });
        toast({ title: 'Screen sharing', description: 'Started sharing your screen.', variant: 'default' });
      } catch (err) {
        if (err?.name !== 'AbortError' && err?.name !== 'NotAllowedError') {
          toast({ title: 'Screen share failed', description: err.message || String(err), variant: 'destructive' });
        }
      }
    } else {
      stopScreenShare();
    }
  };

  // Cleanup media on unmount (tab close, navigation)
  useEffect(() => {
    return () => {
      const stream = useStore.getState().localStream;
      if (stream) stopStream(stream);
      if (cameraVideoTrackRef.current) { try { cameraVideoTrackRef.current.stop(); } catch (_) {} }
      if (screenTrackRef.current) { try { screenTrackRef.current.stop(); } catch (_) {} }
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (_) {} }
      resetWebRTC();
    };
  }, []);

  const leaveMeeting = useCallback(() => {
    const sock = getSocket();
    const currentRoom = currentRoomRef.current;
    if (sock && currentRoom) sock.emit('leave-meeting', { roomId: currentRoom });
    resetWebRTC();
    // Stop all media tracks to release camera/mic
    const stream = useStore.getState().localStream;
    if (stream) stopStream(stream);
    if (cameraVideoTrackRef.current) { try { cameraVideoTrackRef.current.stop(); } catch (_) {} }
    if (screenTrackRef.current) { try { screenTrackRef.current.stop(); } catch (_) {} }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (_) {} }
    audioCtxRef.current = null;
    setLocalStream(null);
    clearMessages();
    setJoinRequests([]);
    reset();
    storeSetClientRoomId(null);
    mediaInitRef.current = false;
    navigate('/');
  }, [reset, navigate, clearMessages, storeSetClientRoomId]);

  const handleMuteParticipant = (targetSocketId, muted) => {
    getSocket()?.emit('mute-participant', { roomId: useStore.getState().roomId, targetSocketId, muted });
  };

  const handleRemoveParticipant = (targetSocketId) => {
    getSocket()?.emit('remove-participant', { roomId: useStore.getState().roomId, targetSocketId });
  };

  const handleApprove = (targetSocketId) => {
    getSocket()?.emit('approve-participant', { roomId: useStore.getState().roomId, targetSocketId });
    setJoinRequests((prev) => prev.filter((r) => r.socketId !== targetSocketId));
  };

  const handleDeny = (targetSocketId) => {
    getSocket()?.emit('deny-participant', { roomId: useStore.getState().roomId, targetSocketId });
    setJoinRequests((prev) => prev.filter((r) => r.socketId !== targetSocketId));
  };

  const handleAdmit = handleApprove;
  const handleDenyRequest = handleDeny;

  const toggleRaiseHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    getSocket()?.emit('raise-hand', { roomId: useStore.getState().roomId, raised: next });
  };

  const sendReaction = (emoji) => {
    getSocket()?.emit('send-reaction', { roomId: useStore.getState().roomId, emoji });
    setShowReactionPicker(false);
  };

  const copyMeetingLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    toast({ title: 'Link copied', description: 'Meeting link copied to clipboard.', variant: 'default' });
    setTimeout(() => setCopied(false), 2000);
  };

  const togglePin = (socketId) => {
    setPinnedSocketId((prev) => (prev === socketId ? null : socketId));
  };

  if (!roomIdParam) return null;

  const store = useStore.getState();
  const isHost = store.isHost;
  const meParticipant = {
    socketId: mySocketIdRef.current,
    name,
    host: isHost,
    muted: !audioEnabled,
    cameraOff: !videoEnabled,
    handRaised,
  };
  const allParticipants = [meParticipant, ...participants.filter((p) => p.socketId !== mySocketIdRef.current)];
  const pinnedParticipant = pinnedSocketId
    ? allParticipants.find((p) => p.socketId === pinnedSocketId)
    : null;
  const unpinnedParticipants = pinnedParticipant
    ? allParticipants.filter((p) => p.socketId !== pinnedSocketId)
    : allParticipants;

  // ---- Loading / error states ----
  if (joining && !localStream && !mediaError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center mb-4 animate-pulse">
          <Activity className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-lg font-medium text-slate-100 mb-2">Joining meeting…</h2>
        <p className="text-slate-500 text-sm">Setting up your call</p>
      </div>
    );
  }

  if (mediaError && !localStream) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-red/10 flex items-center justify-center mb-6">
          <Phone className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100 mb-2">Camera / Microphone access</h2>
        <p className="text-slate-400 mb-6 max-w-md">
          {mediaError === 'PERMISSION_TIMEOUT'
            ? 'Permission dialog timed out. You can join without media and enable it later.'
            : mediaError}
        </p>
        <button
          onClick={() => {
            setMediaError(null);
            setJoining(false);
            const store = useStore.getState();
            initMedia(store.roomId, store.type, store.isHost, store.name, store.participants);
          }}
          className="btn btn-primary w-auto"
        >
          Join without media
        </button>
        <button
          onClick={leaveMeeting}
          className="mt-4 text-sm text-slate-500 hover:text-white underline underline-offset-4"
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#202124] text-white">
      {/* Top bar */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/40 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <span className="text-sm font-medium text-[#e8eaed]">{roomIdParam}</span>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className={`w-2 h-2 rounded-full ${getSocket().connected ? 'bg-[#34a853]' : 'bg-[#9aa0a6]'} animate-pulse`} />
          <span className="text-xs text-[#9aa0a6]">
            {getSocket().connected ? 'Connected' : 'Reconnecting…'}
          </span>
        </div>
      </header>

      {/* Video grid / Spotlight */}
      <main
        className={`absolute inset-0 flex items-center justify-center p-4 pt-12 pb-24 transition-all duration-300 ${
          chatOpen || participantsOpen ? 'pr-[376px]' : ''
        }`}
      >
        {pinnedParticipant ? (
          <div className="w-full h-full flex gap-3">
            <div className="flex-1 h-full min-w-0">
              <VideoTile
                key={pinnedParticipant.socketId}
                socketId={pinnedParticipant.socketId}
                name={pinnedParticipant.name}
                host={pinnedParticipant.host}
                muted={pinnedParticipant.muted}
                cameraOff={pinnedParticipant.cameraOff}
                speaking={pinnedParticipant.socketId === speakerId}
                handRaised={pinnedParticipant.handRaised}
                pinned={true}
                onPin={togglePin}
                stream={
                  pinnedParticipant.socketId === mySocketIdRef.current
                    ? localStream
                    : remoteStreams[pinnedParticipant.socketId]
                }
                isLocal={pinnedParticipant.socketId === mySocketIdRef.current}
                isScreenSharing={pinnedParticipant.socketId === mySocketIdRef.current && screenSharing}
                localStream={localStream}
              />
            </div>
            {unpinnedParticipants.length > 0 && (
              <div className="w-60 h-full flex flex-col gap-2 overflow-y-auto shrink-0">
                {unpinnedParticipants.map((p) => {
                  const isSelf = p.socketId === mySocketIdRef.current;
                  const stream = isSelf ? localStream : remoteStreams[p.socketId];
                  return (
                    <div key={p.socketId} className="h-36 shrink-0">
                      <VideoTile
                        socketId={p.socketId}
                        name={p.name}
                        host={p.host}
                        muted={p.muted}
                        cameraOff={p.cameraOff}
                        speaking={p.socketId === speakerId}
                        handRaised={p.handRaised}
                        pinned={false}
                        onPin={togglePin}
                        stream={stream}
                        isLocal={isSelf}
                        isScreenSharing={isSelf && screenSharing}
                        localStream={localStream}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div
            className="w-full h-full grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gridAutoRows: '1fr',
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
            {allParticipants.map((p) => {
              const isSelf = p.socketId === mySocketIdRef.current;
              const stream = isSelf ? localStream : remoteStreams[p.socketId];
              return (
                <VideoTile
                  key={p.socketId}
                  socketId={p.socketId}
                  name={p.name}
                  host={p.host}
                  muted={p.muted}
                  cameraOff={p.cameraOff}
                  speaking={p.socketId === speakerId}
                  handRaised={p.handRaised}
                  pinned={false}
                  onPin={togglePin}
                  stream={stream}
                  isLocal={isSelf}
                  isScreenSharing={isSelf && screenSharing}
                  localStream={localStream}
                />
              );
            })}
            {allParticipants.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center text-[#9aa0a6]">
                <div className="w-16 h-16 rounded-full bg-[#3c4043] flex items-center justify-center mb-3">
                  <User className="w-8 h-8" />
                </div>
                <p className="text-sm">Waiting for others to join…</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating emoji reactions */}
      {reactions.length > 0 && (
        <div className="pointer-events-none fixed bottom-24 left-12 z-40">
          {reactions.map((r, idx) => (
            <div
              key={r.id}
              style={{
                left: `${(idx % 5) * 28}px`,
                animation: 'floatUp 2.8s ease-out forwards',
              }}
              className="absolute bottom-0 flex flex-col items-center gap-1"
            >
              <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
              <span className="px-2 py-0.5 rounded-full bg-[#3c4043]/90 text-[11px] text-[#e8eaed] font-medium whitespace-nowrap shadow">
                {r.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom control bar (Google Meet 3-section layout) */}
      <footer className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-4 bg-[#202124]">
        {/* Left: Clock + Meeting code + Copy link */}
        <div className="hidden md:flex items-center gap-3 min-w-[200px]">
          <span className="text-sm font-medium text-[#e8eaed]">{clock}</span>
          <span className="text-[#5f6368]">|</span>
          <span className="text-sm text-[#e8eaed] font-medium truncate max-w-[140px]">{roomIdParam}</span>
          <button
            onClick={copyMeetingLink}
            title="Copy meeting link"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-[#3c4043] transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-[#81c995]" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Center: Primary media & meeting controls */}
        <div className="relative flex items-center gap-2 mx-auto md:mx-0">
          <ControlButton
            icon={!audioEnabled ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            label={audioEnabled ? 'Turn off microphone' : 'Turn on microphone'}
            active={!audioEnabled}
            onClick={toggleAudio}
            activeColor="bg-[#ea4335]"
          />
          <ControlButton
            icon={!videoEnabled ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            active={!videoEnabled}
            onClick={toggleVideo}
            activeColor="bg-[#ea4335]"
          />

          {/* Reactions */}
          <div className="relative">
            <ControlButton
              icon={<Smile className="w-5 h-5" />}
              label="Send a reaction"
              active={showReactionPicker}
              onClick={() => setShowReactionPicker((v) => !v)}
              activeColor="bg-[#8ab4f8]/20 text-[#8ab4f8]"
            />
            {showReactionPicker && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-2 rounded-full bg-[#3c4043] border border-[#5f6368] shadow-xl z-50">
                {['👍', '❤️', '😂', '🎉', '👏', '😮'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xl hover:bg-[#5f6368] transition-transform hover:scale-110"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ControlButton
            icon={<Hand className="w-5 h-5" />}
            label={handRaised ? 'Lower hand' : 'Raise hand'}
            active={handRaised}
            onClick={toggleRaiseHand}
            activeColor="bg-[#fdd663] text-[#202124]"
          />

          <ControlButton
            icon={screenSharing ? <Share2 className="w-5 h-5 text-[#8ab4f8]" /> : <Share className="w-5 h-5" />}
            label={screenSharing ? 'Stop presenting' : 'Present now'}
            active={screenSharing}
            onClick={toggleScreenShare}
            activeColor="bg-[#8ab4f8]/20"
          />

          <ControlButton
            icon={<LogOut className="w-5 h-5" />}
            label="Leave call"
            onClick={leaveMeeting}
            className="w-14 h-11 rounded-full bg-[#ea4335] text-white hover:bg-[#d93025] transition-colors flex items-center justify-center ml-1"
          />
        </div>

        {/* Right: People & Chat panels */}
        <div className="hidden md:flex items-center justify-end gap-2 min-w-[200px]">
          <div className="relative">
            <ControlButton
              icon={<Users className="w-5 h-5" />}
              label="People"
              active={participantsOpen}
              onClick={() => {
                const next = !participantsOpen;
                setParticipantsOpen(next);
                if (next) setChatOpen(false);
              }}
              activeColor="bg-[#8ab4f8]/20 text-[#8ab4f8]"
            />
            {waiting.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#ea4335] text-white text-[10px] font-bold flex items-center justify-center pointer-events-none">
                {waiting.length}
              </span>
            )}
          </div>
          <div className="relative">
            <ControlButton
              icon={<MessageCircle className="w-5 h-5" />}
              label="Chat with everyone"
              active={chatOpen}
              onClick={() => {
                const next = !chatOpen;
                setChatOpen(next);
                if (next) setParticipantsOpen(false);
              }}
              activeColor="bg-[#8ab4f8]/20 text-[#8ab4f8]"
            />
            {unreadCount > 0 && !chatOpen && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#8ab4f8] text-[#202124] text-[10px] font-bold flex items-center justify-center pointer-events-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
        </div>
      </footer>

      {/* Join request notifications (Google Meet style) */}
      {joinRequests.length > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center">
          {joinRequests.map((req) => (
            <div
              key={req.socketId}
              className="flex items-center gap-3 bg-[#3c4043] rounded-full px-4 py-2 shadow-xl border border-[#5f6368]"
            >
              <span className="text-sm text-[#e8eaed]">{req.name} is asking to join</span>
              <button
                onClick={() => handleAdmit(req.socketId)}
                className="px-3 py-1 rounded-full bg-[#8ab4f8] text-[#202124] text-sm font-medium hover:bg-[#aecbfa] transition-colors"
              >
                Admit
              </button>
              <button
                onClick={() => handleDenyRequest(req.socketId)}
                className="px-3 py-1 rounded-full text-[#e8eaed] text-sm font-medium hover:bg-[#5f6368] transition-colors"
              >
                Deny
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="absolute top-0 right-0 bottom-0 z-40 flex">
        {chatOpen && (
          <div className="w-[360px] h-full bg-[#202124] border-l border-[#3c4043] shadow-xl animate-slide-in">
            <ChatSidebar open={chatOpen} onClose={() => setChatOpen(false)} socket={getSocket()} />
          </div>
        )}
        {participantsOpen && (
          <div className="w-[360px] h-full bg-[#202124] border-l border-[#3c4043] shadow-xl animate-slide-in">
            <ParticipantList
              open={participantsOpen}
              onClose={() => setParticipantsOpen(false)}
              socket={getSocket()}
              isHost={isHost}
              roomId={store.roomId}
              waiting={waiting}
              type={store.type}
              onApprove={handleApprove}
              onDeny={handleDeny}
              onMute={handleMuteParticipant}
              onRemove={handleRemoveParticipant}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ControlButton({ icon, label, active, onClick, className, activeColor }) {
  const baseClass = className || 'w-12 h-12 rounded-full bg-transparent text-[#e8eaed] hover:bg-[#5f6368] transition-colors';
  const activeClass = active ? (activeColor || 'bg-[#5f6368]') : '';
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`flex items-center justify-center transition-colors ${baseClass} ${activeClass}`}
        aria-pressed={active}
        title={label}
      >
        {icon}
      </button>
      <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-[#3c4043] text-[11px] text-[#e8eaed] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-[#5f6368] z-20">
        {label}
      </span>
    </div>
  );
}
