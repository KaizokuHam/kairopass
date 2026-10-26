import { Camera, ScanLine, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQrScanner } from '@/hooks/useQrScanner';
export function QRScanner({ enabled, detected }: { enabled: boolean; detected: (text: string) => void }) {
  const { video, phase, error, devices, deviceId, setDeviceId, start, stop } = useQrScanner(enabled, detected);
  const active = phase === 'REQUESTING_CAMERA' || phase === 'SCANNING';
  return <section className="checkin-scanner" aria-labelledby="camera-heading"><div className="checkin-section-heading"><Camera size={21} /><div><p className="eyebrow">LOCAL CAMERA SCANNER</p><h2 id="camera-heading">Bring the ticket into view.</h2></div></div>
    <div className={'checkin-preview' + (phase === 'SCANNING' ? ' is-scanning' : '')}><video ref={video} autoPlay playsInline muted aria-label="Camera preview" /><div className="scanner-guide" aria-hidden="true"><ScanLine size={48} /><span>ONE TICKET. ONE ADMISSION.</span></div></div>
    <p className="checkin-camera-state" role="status">{phase === 'REQUESTING_CAMERA' ? 'Requesting camera permission…' : phase === 'SCANNING' ? 'Scanning locally. Hold the complete QR inside the frame.' : phase === 'QR_DETECTED' ? 'QR detected. Camera stopped for verification.' : enabled ? 'Camera is off. Start scanning when you’re ready.' : 'Camera is paused. Verify event availability or choose the next ticket.'}</p>
    {error && <p className="checkin-camera-error" role="alert">{error}</p>}
    {devices.length > 1 && <label className="checkin-device">Camera<select value={deviceId} disabled={active || !enabled} onChange={(e) => setDeviceId(e.target.value)}><option value="">Prefer rear camera</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</select></label>}
    <div className="checkin-controls"><Button disabled={!enabled || active} onClick={() => { void start(); }}><Camera size={16} />Start camera</Button><Button variant="ghost" disabled={!active} onClick={stop}><Square size={14} />Stop camera</Button></div><p className="checkin-note">Camera permission is requested only when you start. Frames are decoded on this device and are never uploaded.</p>
  </section>;
}
