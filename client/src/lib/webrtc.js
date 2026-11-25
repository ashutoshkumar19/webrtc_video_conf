/**
 * Manages buffering and flushing of ICE candidates that arrive
 * before the corresponding RTCPeerConnection exists.
 */
import { useStore } from '../store';
import { getSocket } from './socket';
export class IceCandidateBuffer {
  constructor() {
    this._buffer = new Map();
  }

  add(socketId, candidate) {
    if (!this._buffer.has(socketId)) {
      this._buffer.set(socketId, []);
    }
    this._buffer.get(socketId).push(candidate);
  }

  flush(socketId, pc) {
    const pending = this._buffer.get(socketId);
    if (!pending) return;
    pending.forEach((c) => {
      try {
        pc.addIceCandidate(c);
      } catch (err) {
        console.error('[webrtc] addIceCandidate (flush) error', err);
      }
    });
    this._buffer.delete(socketId);
  }

  clear(socketId) {
    this._buffer.delete(socketId);
  }

  clearAll() {
    this._buffer.clear();
  }
}

/**
 * Wraps a single RTCPeerConnection and its lifecycle.
 */
export class PeerConnection {
  constructor(socketId, configuration, localStream, handlers) {
    this.socketId = socketId;
    this.pc = new RTCPeerConnection(configuration);
    this._handlers = handlers;

    if (localStream) {
      localStream.getTracks().forEach((track) => this.pc.addTrack(track, localStream));
    }

    this.pc.onicecandidate = (event) => {
      if (event.candidate && handlers.sendSignal) {
        handlers.sendSignal(socketId, 'ice-candidate', { candidate: event.candidate });
      }
    };

    this.pc.ontrack = (event) => {
      const stream = event.streams && event.streams[0]
        ? event.streams[0]
        : new MediaStream([event.track]);
      if (handlers.onTrack) handlers.onTrack(socketId, stream);
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed') {
        try {
          this.pc.restartIce();
        } catch {
          // ignore if restartIce is not supported or connection is closed
        }
      } else if (this.pc.connectionState === 'disconnected') {
        if (handlers.onPeerClose) handlers.onPeerClose(socketId, this.pc.connectionState);
      }
    };
  }

  get native() { return this.pc; }

  addTracks(localStream) {
    if (localStream && this.pc.getSenders().length === 0) {
      localStream.getTracks().forEach((track) => this.pc.addTrack(track, localStream));
    }
  }

  getSenders() {
    return this.pc.getSenders();
  }

  getReceivers() {
    return this.pc.getReceivers();
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async setRemoteDescription(desc) {
    await this.pc.setRemoteDescription(desc);
  }

  async createAnswer() {
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async addIceCandidate(candidate) {
    await this.pc.addIceCandidate(candidate);
  }

  close() {
    try {
      this.pc.getSenders().forEach((s) => {
        try { this.pc.removeTrack(s); } catch (_) {}
      });
      this.pc.close();
    } catch (_) {}
  }
}

/**
 * Facade over peer connections, signaling, and ICE buffering.
 * Maintains backward-compatible API with the original WebRTCManager.
 */
export class WebRTCManager {
  constructor() {
    this.pcs = new Map();
    this.iceBuffer = new IceCandidateBuffer();
    this.onTrack = null;
    this.onPeerClose = null;
    this.configuration = { iceServers: this.buildIceServers() };
  }

  buildIceServers() {
    const stunUrls = (typeof process !== 'undefined' && process.env && process.env.VITE_STUN_URLS
      ? process.env.VITE_STUN_URLS
      : 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'
    ).split(',').map((s) => s.trim()).filter(Boolean);

    const iceServers = stunUrls.map((url) => ({ urls: url }));

    const turnUrl = typeof process !== 'undefined' && process.env && process.env.VITE_TURN_URL;
    const turnUsername = typeof process !== 'undefined' && process.env && process.env.VITE_TURN_USERNAME;
    const turnCredential = typeof process !== 'undefined' && process.env && process.env.VITE_TURN_CREDENTIAL;
    if (turnUrl) {
      iceServers.push({
        urls: turnUrl,
        ...(turnUsername ? { username: turnUsername } : {}),
        ...(turnCredential ? { credential: turnCredential } : {}),
      });
    }
    return iceServers;
  }

  setHandlers({ onTrack, onPeerClose }) {
    this.onTrack = onTrack;
    this.onPeerClose = onPeerClose;
  }

  _createPeer(socketId, localStream) {
    const handlers = {
      onTrack: this.onTrack,
      onPeerClose: this.onPeerClose,
      sendSignal: (target, type, payload) => this._emitSignal(target, type, payload),
    };
    const peer = new PeerConnection(socketId, this.configuration, localStream, handlers);
    this.pcs.set(socketId, peer);
    this.iceBuffer.flush(socketId, peer.native);
    return peer;
  }

  getPC(socketId, localStream) {
    let peer = this.pcs.get(socketId);
    if (peer) {
      peer.addTracks(localStream);
      return peer.native;
    }
    peer = this._createPeer(socketId, localStream);
    return peer.native;
  }

  async createOffer(socketId, localStream) {
    const pc = this.getPC(socketId, localStream);
    const peer = this.pcs.get(socketId);
    const offer = await peer.createOffer();
    this._emitSignal(socketId, 'offer', { sdp: offer.sdp, type: offer.type });
  }

  async handleAnswer(socketId, answer) {
    const pc = this.pcs.get(socketId);
    if (!pc) return;
    await pc.setRemoteDescription(answer);
  }

  async handleOffer(socketId, offer, localStream) {
    const pc = this.getPC(socketId, localStream);
    const peer = this.pcs.get(socketId);
    await peer.setRemoteDescription(offer);
    const answer = await peer.createAnswer();
    this._emitSignal(socketId, 'answer', { sdp: answer.sdp, type: answer.type });
  }

  async handleIceCandidate(socketId, candidate) {
    const pc = this.pcs.get(socketId);
    const raw = candidate && candidate.candidate ? candidate.candidate : candidate;
    const iceCandidate = raw instanceof RTCIceCandidate ? raw : new RTCIceCandidate(raw);
    if (pc) {
      try {
        await pc.addIceCandidate(iceCandidate);
      } catch (err) {
        console.error('[webrtc] addIceCandidate error', err);
      }
    } else {
      this.iceBuffer.add(socketId, iceCandidate);
    }
  }

  _emitSignal(target, type, payload) {
    const sock = getSocket();
    if (!sock) return;
    const { roomId } = useStore.getState();
    if (!roomId) return;
    sock.emit('webrtc-signal', { to: target, type, payload, roomId });
  }

  closePeer(socketId) {
    const peer = this.pcs.get(socketId);
    if (peer) {
      peer.close();
      this.pcs.delete(socketId);
    }
    this.iceBuffer.clear(socketId);
  }

  closeAll() {
    this.pcs.forEach((peer) => peer.close());
    this.pcs.clear();
    this.iceBuffer.clearAll();
  }

  getPeer(socketId) {
    return this.pcs.get(socketId)?.native;
  }
}

let manager = null;

export const getWebRTC = () => {
  if (!manager) manager = new WebRTCManager();
  return manager;
};

export const resetWebRTC = () => {
  if (manager) {
    manager.closeAll();
    manager = null;
  }
};