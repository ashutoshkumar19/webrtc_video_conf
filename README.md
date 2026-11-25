# Video Conferencing App

A modern, fully functional real-time video conferencing web application, rebuilt from scratch. Built with React, Vite, Tailwind CSS, WebRTC, Socket.io, and Node.js/Express.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, Tailwind CSS |
| State | Zustand |
| Routing | react-router-dom |
| Icons | lucide-react |
| Signaling server | Node.js, Express, Socket.io v4 |
| Real-time media | WebRTC (RTCPeerConnection, getUserMedia) |
| Build | Vite |
| Lint | ESLint |

## Prerequisites

- Node.js >= 20 (tested with Node 26)
- npm
- A modern browser with WebRTC support (Chrome, Firefox, Edge, Safari)
- For camera/microphone access: HTTPS is required in production; `localhost` is exempt

## Installation

```bash
# Clone / open the project
cd webrtc_video_conf

# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

## Environment variables

Create a `.env` file in the project root (server side) for optional STUN/TURN configuration:

```env
PORT=5000
NODE_ENV=development
CORS_ORIGIN=*

# STUN servers (comma separated)
VITE_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302

# Optional TURN server (for clients on restrictive networks)
VITE_TURN_URL=turn:your-turn-server:3478
VITE_TURN_USERNAME=turn-user
VITE_TURN_CREDENTIAL=turn-password
```

Client-side variables are prefixed with `VITE_` and are read at build time by Vite. Server reads `PORT`, `NODE_ENV`, and `CORS_ORIGIN`.

### STUN/TURN
STUN is usually enough for clients on the same network or behind NAT. TURN is required for peers on restrictive corporate/symmetric-NAT networks. Provide TURN credentials via the variables above; if omitted, only the default public STUN servers are used.

## How to run locally

### Development (server + client together)
```bash
npm run dev
```
This starts:
- Server: `http://localhost:5000`
- Client: `http://localhost:5173` (proxies `/socket.io` to the server)

Open `http://localhost:5173` in your browser.

### Separately
```bash
# Terminal 1 - server
npm run server

# Terminal 2 - client
npm run client   # (or: cd client && npm run dev)
```

### Production build
```bash
cd client && npm run build && cd ..
npm start       # server serves the built client from client/dist
```

## Testing with multiple windows/devices

1. Open the app in two browser windows (or two browsers / incognito windows) — each simulates a separate device.
2. In window A, enter a display name and click **Create a meeting** (Open or Managed). Copy the meeting ID.
3. In window B, enter a (different) display name and click **Join a meeting**, then paste the meeting ID.
   - **Open room**: B joins immediately.
   - **Managed room**: B lands in the waiting room; window A (host) sees a join request and can **Allow** or **Deny**.
4. Verify:
   - Both video tiles appear; microphone/camera toggles work on each.
   - The active speaker is highlighted.
   - Host (window A) can mute/remove the other participant; removed participant is disconnected and blocked from rejoining.
   - Real-time chat appears instantly; own messages align right.
   - Type `@` in chat to see participants, select one, and the mentioned user gets a notification.
   - Refresh/reopen a tab to test reconnection.

Because WebRTC media requires camera/microphone permissions, grant them when prompted by the browser.

## WebRTC / STUN / TURN setup

- Default STUN servers: `stun.l.google.com:19302` and `stun1.l.google.com:19302`.
- To support peers across restrictive NATs, run a TURN server (e.g. Coturn) and set `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`.
- The client builds an `RTCConfiguration` `iceServers` array from these variables (see `client/src/lib/webrtc.js`).

## Known limitations

- **Mesh topology**: every participant opens a peer connection to every other participant, which works well for small meetings (roughly up to ~6–8 participants). Larger calls would require an SFU.
- **Screen sharing**: uses `getDisplayMedia` and `RTCRTPSender.replaceTrack`; behavior varies slightly by browser and requires a secure context (HTTPS or localhost).
- **Room state is in-memory** on the server; restarting the server drops active meetings. Persistence (database) can be added later.
- **Browser permissions**: camera/microphone access requires user consent; denied permissions result in joining without that media track. A timeout is provided so the permission dialog doesn't hang the join flow.
- No authentication / user accounts beyond the display name entered on the landing page.

## License

ISC