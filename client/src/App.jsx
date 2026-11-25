import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from '@/hooks/use-toast';
import { useStore } from '@/store';
import { stopStream } from '@/lib/media';
import { resetWebRTC } from '@/lib/webrtc';
import Landing from '@/components/Landing';
import Meeting from '@/components/Meeting';
import WaitingRoom from '@/components/WaitingRoom';

export default function App() {
  // Clean up media when the tab/window is closed.
  useEffect(() => {
    const onBeforeUnload = () => {
      const stream = useStore.getState().localStream;
      if (stream) stopStream(stream);
      resetWebRTC();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/meeting/:roomId" element={<Meeting />} />
        <Route path="/waiting/:roomId" element={<WaitingRoom />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
