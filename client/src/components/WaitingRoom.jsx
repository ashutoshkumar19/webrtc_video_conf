import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, MessageCircle, X, ArrowLeft, Phone } from 'lucide-react';
import { useStore } from '@/store';
import { connectSocket, getSocket, setClientRoomId } from '@/lib/socket';

export default function WaitingRoom() {
  const navigate = useNavigate();
  const { roomId: roomIdParam } = useParams();
  const { name, setMeeting, setParticipants, setName, reset, setClientRoomId: storeSetClientRoomId } = useStore();
  const [status, setStatus] = useState('waiting'); // waiting | admitted | denied

  useEffect(() => {
    if (!roomIdParam) return;
      const sock = getSocket() || connectSocket(window.location.origin);

    // Request to join (places user in waiting room for managed rooms)
    sock.emit('join-meeting', { roomId: roomIdParam, name: name || localStorage.getItem('vc_name') || 'Guest' });

    const onAdmitted = (data) => {
      setMeeting(data.roomId, data.type, data.isHost, data.me, data.participants);
      setParticipants(data.participants);
      setName(data.me.name);
      localStorage.setItem('vc_name', data.me.name);
      setClientRoomId(data.roomId);
      storeSetClientRoomId(data.roomId);
      setStatus('admitted');
    };
    const onDenied = () => {
      setStatus('denied');
    };
    const onMeetingLeft = () => navigate('/');
    const onAccessDenied = (data) => {
      setStatus('denied');
    };

    sock.on('admitted', onAdmitted);
    sock.on('denied', onDenied);
    sock.on('meeting-left', onMeetingLeft);
    sock.on('access-denied', onAccessDenied);

    return () => {
      sock.off('admitted', onAdmitted);
      sock.off('denied', onDenied);
      sock.off('meeting-left', onMeetingLeft);
      sock.off('access-denied', onAccessDenied);
    };
  }, [roomIdParam, name, navigate, setMeeting, setParticipants, setName, setClientRoomId, storeSetClientRoomId]);

  useEffect(() => {
    if (status === 'admitted') {
      const t = setTimeout(() => navigate(`/meeting/${roomIdParam}`), 800);
      return () => clearTimeout(t);
    }
  }, [status, roomIdParam, navigate]);

  const cancel = () => {
    const sock = getSocket();
    if (sock) sock.emit('leave-meeting', { roomId: roomIdParam });
    reset();
    storeSetClientRoomId(null);
    navigate('/');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-6">
      <div className={`w-16 h-16 rounded-full ${status === 'denied' ? 'bg-red/10' : 'bg-amber-500/20'} flex items-center justify-center mb-6 animate-pulse`}>
        {status === 'denied' ? <X className="w-8 h-8 text-red-400" /> : <Clock className="w-8 h-8 text-amber-400" />}
      </div>
      {status === 'denied' ? (
        <>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Join request declined</h2>
          <p className="text-slate-400 mb-8 max-w-md">
            The host declined your request to join this meeting. You can try joining again or contact the host.
          </p>
          <button
            onClick={cancel}
            className="px-6 py-3 rounded-xl bg-slate-700 text-white hover:bg-slate-600 transition-colors"
          >
            Back to home
          </button>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Waiting for the host</h2>
          <p className="text-slate-400 mb-8 max-w-md">
            Your join request has been sent. The host will admit you shortly.
          </p>
          <button
            onClick={cancel}
            className="px-6 py-3 rounded-xl border border-slate-600 text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            Cancel request
          </button>
        </>
      )}
    </div>
  );
}
