import { io } from 'socket.io-client';
import { useStore } from '../store';

let socket = null;

export const connectSocket = (url) => {
  if (socket) return socket;
  const serverUrl = url || window.location.origin;
  socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: {},
  });
  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

// Client-side room tracking helper
export const setClientRoomId = (roomId) => {
  useStore.getState().setClientRoomId(roomId);
};

export const getClientRoomId = () => {
  return useStore.getState().clientRoomId;
};
