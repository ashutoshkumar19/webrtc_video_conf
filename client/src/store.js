import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // Identity
  name: '',
  setName: (name) => set({ name }),

  // Socket / connection
  socket: null,
  connected: false,
  connectionStatus: 'idle', // idle | connecting | connected | disconnected | error
  setSocket: (socket) => set({ socket }),
  setConnected: (connected) => set({ connected }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // Client-side room tracking (sock.data is server-side only)
  clientRoomId: null,
  setClientRoomId: (roomId) => set({ clientRoomId: roomId }),

  // Meeting state
  roomId: null,
  type: 'open',
  isHost: false,
  me: null,
  meetingEnded: false,
  accessDenied: false,
  accessDeniedMessage: '',

  setMeeting: (roomId, type, isHost, me, participants = []) =>
    set({ roomId, type, isHost, me, participants, meetingEnded: false, accessDenied: false }),

  setIsHost: (isHost) => set({ isHost }),
  setType: (type) => set({ type }),

  endMeeting: () => set({ meetingEnded: true }),
  setAccessDenied: (message) => set({ accessDenied: true, accessDeniedMessage: message }),

  // Participants
  participants: [],
  setParticipants: (participants) => set({ participants }),
  addParticipant: (participant) =>
    set((state) => ({
      participants: [...state.participants.filter((p) => p.socketId !== participant.socketId), participant],
    })),
  removeParticipant: (socketId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.socketId !== socketId),
    })),
  updateParticipant: (socketId, updates) =>
    set((state) => ({
      participants: state.participants.map((p) =>
        p.socketId === socketId ? { ...p, ...updates } : p
      ),
    })),

  // Waiting room
  waiting: [],
  setWaiting: (waiting) => set({ waiting }),
  addWaiting: (entry) =>
    set((state) => ({
      waiting: [...state.waiting.filter((w) => w.socketId !== entry.socketId), entry],
    })),
  removeWaiting: (socketId) =>
    set((state) => ({ waiting: state.waiting.filter((w) => w.socketId !== socketId) })),

  // Media
  localStream: null,
  audioEnabled: true,
  videoEnabled: true,
  micPermissionDenied: false,
  camPermissionDenied: false,
  mediaError: null,
  setLocalStream: (stream) => set({ localStream: stream }),
  setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),
  setVideoEnabled: (enabled) => set({ videoEnabled: enabled }),
  setMicPermissionDenied: (v) => set({ micPermissionDenied: v }),
  setCamPermissionDenied: (v) => set({ camPermissionDenied: v }),
  setMediaError: (err) => set({ mediaError: err }),

  // Remote media streams (socketId -> MediaStream)
  remoteStreams: {},
  setRemoteStream: (socketId, stream) =>
    set((state) => ({ remoteStreams: { ...state.remoteStreams, [socketId]: stream } })),
  clearRemoteStreams: () => set({ remoteStreams: {} }),
  removeRemoteStream: (socketId) =>
    set((state) => {
      const next = { ...state.remoteStreams };
      delete next[socketId];
      return { remoteStreams: next };
    }),

  // Chat
  messages: [],
  input: '',
  mentionQuery: '',
  mentionSuggestions: [],
  chatOpen: false,
  participantsOpen: false,
  mentionNotification: null,
  setMentionNotification: (n) => set({ mentionNotification: n }),
  clearMentionNotification: () => set({ mentionNotification: null }),

  setChatOpen: (v) => set({ chatOpen: v }),
  setParticipantsOpen: (v) => set({ participantsOpen: v }),
  setInput: (input) => set({ input }),
  setMentionQuery: (query) => set({ mentionQuery: query }),
  setMentionSuggestions: (suggestions) => set({ mentionSuggestions: suggestions }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setMessages: (messages) =>
    set((state) => ({
      messages: typeof messages === 'function' ? messages(state.messages) : messages,
    })),
  clearMessages: () => set({ messages: [] }),

  // UI
  selfView: true,
  setSelfView: (v) => set({ selfView: v }),

  reset: () =>
    set({
      roomId: null,
      type: 'open',
      isHost: false,
      me: null,
      meetingEnded: false,
      accessDenied: false,
      accessDeniedMessage: '',
      clientRoomId: null,
      participants: [],
      waiting: [],
      localStream: null,
      audioEnabled: true,
      videoEnabled: true,
      micPermissionDenied: false,
      camPermissionDenied: false,
      mediaError: null,
      remoteStreams: {},
      messages: [],
      input: '',
      mentionQuery: '',
      mentionSuggestions: [],
      chatOpen: false,
      participantsOpen: false,
      mentionNotification: null,
      connectionStatus: 'idle',
    }),
}));
