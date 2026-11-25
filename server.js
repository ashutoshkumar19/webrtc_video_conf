const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  allowEIO3: true,
});

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve the built frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

/* --------------------------------------------------------------------------
 * Room / participant state (in-memory)
 * -------------------------------------------------------------------------- */

const ROOM_ID_PREFIX_LEN = 3;
const ROOM_ID_MID_LEN = 4;
const ROOM_ID_SUFFIX_LEN = 3;

function generateRoomId() {
  const rand = (len) => crypto
    .randomBytes(len)
    .toString('base64url')
    .replace(/[^a-z0-9]/g, '')
    .toLowerCase()
    .slice(0, len);
  return `${rand(ROOM_ID_PREFIX_LEN)}-${rand(ROOM_ID_MID_LEN)}-${rand(ROOM_ID_SUFFIX_LEN)}`;
}

function uniqueRoomId(existing) {
  let id;
  do {
    id = generateRoomId();
  } while (existing.has(id));
  return id;
}

// Sanitize chat message: strip HTML tags, collapse whitespace, trim.
function sanitizeMessage(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/, '').replace(/\s+/g, ' ').trim();
}

// Extract @mention target display names from a message.
function extractMentions(text) {
  const mentions = [];
  const regex = /@([\w\-]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

class Participant {
  constructor(socketId, name, isHost = false) {
    this.socketId = socketId;
    this.name = name.trim();
    this.isHost = isHost;
    this.joinedAt = Date.now();
    this.muted = false;        // mic muted (self or host)
    this.cameraOff = false;    // camera off
    this.mutedByHost = false;  // host-enforced mute
    this.speaking = false;
  }
}

class Room {
  constructor(id, type, hostId, hostName) {
    this.id = id;
    this.type = type; // 'open' | 'managed'
    this.hostId = hostId;
    this.createdAt = Date.now();
    this.ended = false;
    this.participants = new Map(); // socketId -> Participant
    this.waiting = new Map();      // socketId -> { name, requestedAt }
    this.approved = new Set();     // socketIds approved by host (managed)
    this.denied = new Set();       // socketIds denied this session
    this.removed = new Set();      // socketIds removed this session
  }

  get isManaged() {
    return this.type === 'managed';
  }

  get participantList() {
    return Array.from(this.participants.values());
  }

  addParticipant(socketId, name, isHost = false) {
    this.participants.set(socketId, new Participant(socketId, name, isHost));
    this.waiting.delete(socketId);
    this.approved.delete(socketId);
  }

  removeParticipant(socketId) {
    this.participants.delete(socketId);
    this.waiting.delete(socketId);
    this.approved.delete(socketId);
  }

  setHost(socketId) {
    for (const p of this.participants.values()) p.isHost = false;
    const p = this.participants.get(socketId);
    if (p) p.isHost = true;
    this.hostId = socketId;
  }

  participantCount() {
    return this.participants.size;
  }
}

const rooms = new Map();

function getRoom(roomId) {
  return rooms.get(roomId);
}

function hasSocketRoom(socket) {
  return socket.data.roomId != null;
}

function leaveCurrentRoom(socket) {
  const { roomId } = socket.data;
  if (!roomId) return;
  const room = getRoom(roomId);
  if (room) {
    socket.leave(roomId);
    room.removeParticipant(socket.id);
    socket.to(roomId).emit('participant-left', { socketId: socket.id });
    // If host left, elect a new host or end the meeting.
    if (room.hostId === socket.id) {
      const remaining = room.participantList;
      if (remaining.length > 0) {
        const newHost = remaining[0];
        room.setHost(newHost.socketId);
        io.to(roomId).emit('host-changed', {
          newHostId: newHost.socketId,
          newHostName: newHost.name,
          by: socket.id,
        });
      } else {
        room.ended = true;
        rooms.delete(roomId);
        io.to(roomId).emit('meeting-ended', { roomId: room.id, reason: 'host-left' });
      }
    }
  }
  socket.data.roomId = null;
  socket.data.roomType = null;
}

/* --------------------------------------------------------------------------
 * Socket.io connection handling
 * -------------------------------------------------------------------------- */

io.on('connection', (socket) => {
  console.log(`[socket] connected ${socket.id}`);

  // ---- Create a new meeting ----
  socket.on('create-meeting', ({ name, type }) => {
    try {
      const displayName = sanitizeName(name);
      if (!displayName) {
        socket.emit('error', { code: 'INVALID_NAME', message: 'Please enter a valid display name.' });
        return;
      }
      if (hasSocketRoom(socket)) {
        leaveCurrentRoom(socket);
      }
      const meetingType = type === 'managed' ? 'managed' : 'open';
      const roomId = uniqueRoomId(rooms);
      const room = new Room(roomId, meetingType, socket.id, displayName);
      room.addParticipant(socket.id, displayName, true);
      rooms.set(roomId, room);
      socket.data.roomId = roomId;
      socket.data.roomType = meetingType;
      socket.join(roomId);

      socket.emit('meeting-created', {
        roomId,
        type: meetingType,
        isHost: true,
        me: { socketId: socket.id, name: displayName, host: true },
      });
      console.log(`[room] created ${roomId} (${meetingType}) host=${socket.id}`);
    } catch (err) {
      console.error('[create-meeting] error', err);
      socket.emit('error', { code: 'SERVER_ERROR', message: 'Failed to create meeting.' });
    }
  });

  // ---- Join an existing meeting ----
  socket.on('join-meeting', ({ roomId, name }) => {
    try {
      const displayName = sanitizeName(name);
      if (!displayName) {
        socket.emit('error', { code: 'INVALID_NAME', message: 'Please enter a valid display name.' });
        return;
      }
      if (!roomId || typeof roomId !== 'string') {
        socket.emit('error', { code: 'INVALID_ROOM', message: 'Please enter a meeting ID.' });
        return;
      }
      if (hasSocketRoom(socket)) {
        leaveCurrentRoom(socket);
      }

      const room = getRoom(roomId);
      if (!room || room.ended) {
        socket.emit('error', {
          code: 'ROOM_NOT_FOUND',
          message: 'Meeting not found or has ended.',
        });
        return;
      }

      // Blocked participants (removed or denied this session) cannot rejoin.
      if (room.removed.has(socket.id) || room.denied.has(socket.id)) {
        socket.emit('access-denied', {
          code: 'ACCESS_DENIED',
          message: 'You are not allowed to join this meeting.',
        });
        return;
      }

      // Managed rooms: non-host participants must be approved.
      if (room.isManaged && socket.id !== room.hostId && !room.participants.has(socket.id)) {
        if (!room.approved.has(socket.id)) {
          // Place in waiting room.
          room.waiting.set(socket.id, { name: displayName, requestedAt: Date.now() });
          socket.data.roomId = roomId;
          socket.data.roomType = 'managed';
          socket.data.waiting = true;
          socket.emit('waiting-room', {
            roomId,
            status: 'waiting',
            message: 'Your join request has been sent. Waiting for the host to admit you.',
          });
          io.to(roomId).emit('join-request', {
            socketId: socket.id,
            name: displayName,
            waiting: Array.from(room.waiting.entries()).map(([id, info]) => ({ socketId: id, ...info })),
          });
          console.log(`[room] ${socket.id} waiting to join ${roomId}`);
          return;
        }
        // Previously approved: consume approval and admit.
        room.approved.delete(socket.id);
      }

      // Admit participant.
      room.addParticipant(socket.id, displayName, socket.id === room.hostId);
      socket.data.roomId = roomId;
      socket.data.roomType = room.type;
      socket.data.waiting = false;
      socket.join(roomId);

      socket.emit('meeting-joined', {
        roomId,
        type: room.type,
        isHost: socket.id === room.hostId,
        me: { socketId: socket.id, name: displayName, host: socket.id === room.hostId },
        participants: room.participantList.map(p => ({
          socketId: p.socketId,
          name: p.name,
          host: p.isHost,
          muted: p.muted,
          cameraOff: p.cameraOff,
          joinedAt: p.joinedAt,
        })),
        waiting: room.isManaged
          ? Array.from(room.waiting.entries()).map(([id, info]) => ({ socketId: id, ...info }))
          : [],
      });

      socket.to(roomId).emit('participant-joined', {
        socketId: socket.id,
        name: displayName,
        host: socket.id === room.hostId,
      });
      console.log(`[room] ${socket.id} joined ${roomId} (${room.type})`);
    } catch (err) {
      console.error('[join-meeting] error', err);
      socket.emit('error', { code: 'SERVER_ERROR', message: 'Failed to join meeting.' });
    }
  });

  // ---- Waiting room: host approves a waiting participant ----
  socket.on('approve-participant', ({ roomId, targetSocketId }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;
      if (socket.id !== room.hostId) {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Only the host can admit participants.' });
        return;
      }
      const waitingInfo = room.waiting.get(targetSocketId);
      if (!waitingInfo) {
        socket.emit('error', { code: 'NO_REQUEST', message: 'No pending request for that participant.' });
        return;
      }
      if (room.denied.has(targetSocketId) || room.removed.has(targetSocketId)) {
        socket.emit('error', { code: 'BLOCKED', message: 'Participant is blocked from joining.' });
        return;
      }

      room.approved.add(targetSocketId);
      room.waiting.delete(targetSocketId);

      // Directly admit the participant: add to room, join socket to room.
      room.addParticipant(targetSocketId, waitingInfo.name, false);
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.data.roomId = roomId;
        targetSocket.data.roomType = room.type;
        targetSocket.data.waiting = false;
        targetSocket.join(roomId);
      }

      // Notify the waiting participant they are admitted (full meeting state).
      io.to(targetSocketId).emit('admitted', {
        roomId,
        isHost: false,
        me: { socketId: targetSocketId, name: waitingInfo.name, host: false },
        participants: room.participantList.map(p => ({
          socketId: p.socketId,
          name: p.name,
          host: p.isHost,
          muted: p.muted,
          cameraOff: p.cameraOff,
          joinedAt: p.joinedAt,
        })),
        waiting: [],
      });

      // Broadcast to the room (including the newly admitted peer).
      io.to(roomId).emit('participant-joined', {
        socketId: targetSocketId,
        name: waitingInfo.name,
        host: false,
      });

      io.to(roomId).emit('join-request-handled', {
        socketId: targetSocketId,
        action: 'approved',
        waiting: Array.from(room.waiting.entries()).map(([id, info]) => ({ socketId: id, ...info })),
      });
      console.log(`[room] host approved & admitted ${targetSocketId} (${waitingInfo.name}) in ${roomId}`);
    } catch (err) {
      console.error('[approve-participant] error', err);
      socket.emit('error', { code: 'SERVER_ERROR', message: 'Failed to approve participant.' });
    }
  });

  // ---- Waiting room: host denies a waiting participant ----
  socket.on('deny-participant', ({ roomId, targetSocketId }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;
      if (socket.id !== room.hostId) {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Only the host can deny participants.' });
        return;
      }
      if (!room.waiting.has(targetSocketId)) {
        socket.emit('error', { code: 'NO_REQUEST', message: 'No pending request for that participant.' });
        return;
      }
      room.waiting.delete(targetSocketId);
      room.denied.add(targetSocketId);

      io.to(targetSocketId).emit('denied', {
        roomId,
        message: 'Your request to join the meeting was declined by the host.',
      });

      io.to(roomId).emit('join-request-handled', {
        socketId: targetSocketId,
        action: 'denied',
        waiting: Array.from(room.waiting.entries()).map(([id, info]) => ({ socketId: id, ...info })),
      });
      console.log(`[room] host denied ${targetSocketId} in ${roomId}`);
    } catch (err) {
      console.error('[deny-participant] error', err);
      socket.emit('error', { code: 'SERVER_ERROR', message: 'Failed to deny participant.' });
    }
  });

  // ---- WebRTC signaling relay ----
  socket.on('webrtc-signal', ({ to, type, payload, roomId }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;
      if (!room.participants.has(socket.id) && !room.participants.has(to)) {
        return; // not a participant
      }
      if (type === 'offer' || type === 'answer') {
        if (!payload || !payload.sdp) return;
      }
      io.to(to).emit('webrtc-signal', {
        from: socket.id,
        type,
        payload,
        roomId,
      });
    } catch (err) {
      console.error('[webrtc-signal] error', err);
    }
  });

  // ---- Real-time chat ----
  socket.on('chat-message', ({ roomId, message, tempId }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;
      const member = room.participants.get(socket.id);
      if (!member) return;

      const clean = sanitizeMessage(message);
      if (!clean) return;

      const mentions = extractMentions(clean);
      const messageId = tempId || crypto.randomBytes(8).toString('hex');
      const payload = {
        id: messageId,
        tempId,
        from: socket.id,
        fromName: member.name,
        message: clean,
        mentions,
        timestamp: Date.now(),
      };

      io.to(roomId).emit('chat-message', payload);

      // Notify explicitly mentioned participants.
      for (const mention of mentions) {
        const target = room.participantList.find(
          (p) => p.socketId !== socket.id && p.name.toLowerCase() === mention.toLowerCase()
        );
        if (target) {
          io.to(target.socketId).emit('mention-notification', {
            roomId,
            from: socket.id,
            fromName: member.name,
            message: clean,
            mentions,
            timestamp: Date.now(),
          });
        }
      }
      console.log(`[chat] ${member.name} in ${roomId}: ${clean}`);
    } catch (err) {
      console.error('[chat-message] error', err);
    }
  });

  // ---- Raise hand ----
  socket.on('raise-hand', ({ roomId, raised }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;
      const member = room.participants.get(socket.id);
      if (!member) return;
      member.handRaised = !!raised;
      io.to(roomId).emit('hand-raised', {
        socketId: socket.id,
        name: member.name,
        raised: member.handRaised,
      });
    } catch (err) {
      console.error('[raise-hand] error', err);
    }
  });

  // ---- Emoji reactions ----
  socket.on('send-reaction', ({ roomId, emoji }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;
      const member = room.participants.get(socket.id);
      if (!member) return;
      const allowed = ['👍', '❤️', '😂', '🎉', '👏', '😮', '🔥', '👎'];
      if (!allowed.includes(emoji)) return;
      io.to(roomId).emit('reaction', {
        id: crypto.randomBytes(6).toString('hex'),
        socketId: socket.id,
        name: member.name,
        emoji,
      });
    } catch (err) {
      console.error('[send-reaction] error', err);
    }
  });

  // ---- Host: mute a participant ----
  socket.on('mute-participant', ({ roomId, targetSocketId, muted }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;
      if (socket.id !== room.hostId) {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Only the host can mute participants.' });
        return;
      }
      const target = room.participants.get(targetSocketId);
      if (!target) return;
      target.muted = !!muted;
      target.mutedByHost = !!muted;
      io.to(roomId).emit('participant-muted', {
        targetSocketId,
        muted: target.muted,
        by: socket.id,
      });
      io.to(targetSocketId).emit('you-muted', { muted: target.muted });
      console.log(`[room] host ${socket.id} muted=${target.muted} ${targetSocketId} in ${roomId}`);
    } catch (err) {
      console.error('[mute-participant] error', err);
    }
  });

  // ---- Host: remove a participant ----
  socket.on('remove-participant', ({ roomId, targetSocketId }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;
      if (socket.id !== room.hostId) {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Only the host can remove participants.' });
        return;
      }
      if (!room.participants.has(targetSocketId)) return;
      const targetName = room.participants.get(targetSocketId).name;
      room.removed.add(targetSocketId);
      room.removeParticipant(targetSocketId);

      io.to(targetSocketId).emit('you-removed', {
        roomId,
        message: 'You have been removed from the meeting by the host.',
      });
      io.to(roomId).emit('participant-removed', {
        targetSocketId,
        targetName,
        by: socket.id,
      });
      console.log(`[room] host removed ${targetSocketId} (${targetName}) from ${roomId}`);
    } catch (err) {
      console.error('[remove-participant] error', err);
    }
  });

  // ---- Participant self media state update ----
  socket.on('participant-update', ({ roomId, muted, cameraOff }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;
      const member = room.participants.get(socket.id);
      if (!member) return;
      // Host-enforced mute cannot be overridden by the participant.
      if (typeof muted === 'boolean' && !member.mutedByHost) {
        member.muted = muted;
      }
      if (typeof cameraOff === 'boolean') {
        member.cameraOff = cameraOff;
      }
      socket.to(roomId).emit('participant-updated', {
        socketId: socket.id,
        muted: member.muted,
        cameraOff: member.cameraOff,
      });
    } catch (err) {
      console.error('[participant-update] error', err);
    }
  });

  // ---- Active speaker indicator ----
  socket.on('speaker-update', ({ roomId, speaking }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;
      const member = room.participants.get(socket.id);
      if (!member) return;
      member.speaking = !!speaking;
      socket.to(roomId).emit('participant-updated', {
        socketId: socket.id,
        speaking: member.speaking,
      });
    } catch (err) {
      console.error('[speaker-update] error', err);
    }
  });

  // ---- Leave meeting ----
  socket.on('leave-meeting', ({ roomId }) => {
    const room = getRoom(roomId);
    const wasHost = room && room.hostId === socket.id;
    leaveCurrentRoom(socket);
    socket.emit('meeting-left', { roomId, wasHost });
  });

  // ---- Disconnect ----
  socket.on('disconnect', () => {
    console.log(`[socket] disconnected ${socket.id}`);
    leaveCurrentRoom(socket);
  });
});

/* --------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------- */

function sanitizeName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/<[^>]*>/, '').replace(/\s+/g, ' ').trim().slice(0, 50);
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
