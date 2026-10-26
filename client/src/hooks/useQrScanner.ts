import { useCallback, useEffect, useRef, useState } from 'react';
import { startQrDecoder, type DecoderControls } from '@/lib/qr-scanner';
type CameraPhase = 'IDLE' | 'REQUESTING_CAMERA' | 'SCANNING' | 'QR_DETECTED' | 'ERROR';
const stopTracks = (stream: MediaStream) => { for (const track of stream.getTracks()) track.stop(); };
export function useQrScanner(enabled: boolean, detected: (text: string) => void) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), controls = useRef<DecoderControls | null>(null);
  const attachedVideo = useRef<HTMLVideoElement | null>(null);
  const generation = useRef(0), busy = useRef(false), alive = useRef(false);
  const decoderAbort = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<CameraPhase>('IDLE'), [error, setError] = useState('');
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]), [deviceId, setDeviceId] = useState('');
  const release = useCallback(() => {
    generation.current++; busy.current = false;
    decoderAbort.current?.abort(); decoderAbort.current = null;
    controls.current?.stop(); controls.current = null;
    if (stream.current) { stopTracks(stream.current); stream.current = null; }
    const preview = attachedVideo.current ?? video.current;
    if (preview?.srcObject) { preview.pause(); preview.srcObject = null; }
    attachedVideo.current = null;
  }, []);
  const stop = useCallback(() => { release(); setPhase('IDLE'); }, [release]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; release(); }; }, [release]);
  useEffect(() => {
    if (!enabled) release();
    void Promise.resolve().then(() => { if (alive.current && !enabled) setPhase('IDLE'); });
  }, [enabled, release]);
  const start = useCallback(async () => {
    if (!enabled || busy.current || !alive.current) return;
    release(); const run = generation.current, controller = new AbortController(); decoderAbort.current = controller;
    busy.current = true; setError(''); setPhase('REQUESTING_CAMERA');
    try {
      if (window.isSecureContext === false) throw new DOMException('Secure context required', 'SecurityError');
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Camera unavailable', 'NotFoundError');
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } } });
      if (!alive.current || run !== generation.current) { stopTracks(acquired); return; }
      stream.current = acquired;
      try {
        const available = await navigator.mediaDevices.enumerateDevices();
        if (alive.current && run === generation.current) setDevices(available.filter((d) => d.kind === 'videoinput').map((d, index) => ({ id: d.deviceId, label: d.label || 'Camera ' + String(index + 1) })));
      } catch { /* Camera selection is optional; a working acquired stream remains usable. */ }
      if (!alive.current || run !== generation.current || !video.current) { stopTracks(acquired); return; }
      const preview = video.current; attachedVideo.current = preview;
      let seen = false;
      const decoding = await startQrDecoder(acquired, preview, (text) => {
        if (seen || !alive.current || run !== generation.current) return;
        seen = true; release(); setPhase('QR_DETECTED'); detected(text);
      }, controller.signal);
      if (!alive.current || run !== generation.current) { decoding.stop(); return; }
      controls.current = decoding; setPhase('SCANNING');
    } catch (failure) {
      if (!alive.current || run !== generation.current) return;
      release(); setPhase('ERROR');
      const name = failure instanceof DOMException || failure instanceof Error ? failure.name : '';
      setError(name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser or use manual signed-credential entry.' :
        name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'No usable camera was found. Use manual signed-credential entry.' :
        name === 'SecurityError' ? 'Camera access needs HTTPS or localhost. Use manual signed-credential entry here.' :
        'The camera could not start. Check whether another app is using it, or use manual signed-credential entry.');
    }
  }, [enabled, deviceId, release, detected]);
  return { video, phase: enabled ? phase : 'IDLE' as CameraPhase, error, devices, deviceId, setDeviceId, start, stop };
}
