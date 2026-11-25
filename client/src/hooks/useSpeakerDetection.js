import { useCallback, useRef, useEffect } from 'react';

/**
 * Manages active-speaker detection via Web Audio API analysers.
 * Returns a ref to the analyser map and a start function.
 */
export function useSpeakerDetection({ localStream, remoteStreams, onSpeakerChange }) {
  const audioCtxRef = useRef(null);
  const analysersRef = useRef(new Map());
  const rafRef = useRef(null);
  const mountRef = useRef(true);

  const analyse = useCallback((stream, socketId) => {
    if (!stream) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

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
  }, []);

  const start = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

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
      onSpeakerChange(speaking && loudest !== 'self' ? loudest : null, speaking && loudest === 'self');
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [localStream, remoteStreams, analyse, onSpeakerChange]);

  const stop = useCallback(() => {
    mountRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    analysersRef.current.forEach(({ source }) => { try { source.disconnect(); } catch (_) {} });
    analysersRef.current.clear();
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch (_) {} }
    audioCtxRef.current = null;
  }, []);

  useEffect(() => {
    mountRef.current = true;
    return () => { mountRef.current = false; };
  }, []);

  return { start, stop, audioCtxRef };
}