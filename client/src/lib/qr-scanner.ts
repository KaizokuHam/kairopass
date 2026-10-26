export interface DecoderControls { stop(): void }
/** Frames stay local. This decoder establishes no network connection or admission authority. */
export async function startQrDecoder(stream: MediaStream, video: HTMLVideoElement, detected: (text: string) => void, signal?: AbortSignal): Promise<DecoderControls> {
  if (signal?.aborted) throw new DOMException('Decoder cancelled', 'AbortError');
  const { BrowserQRCodeReader } = await import('@zxing/browser');
  if (signal?.aborted) throw new DOMException('Decoder cancelled', 'AbortError');
  const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 500 });
  const controls = await reader.decodeFromStream(stream, video, (result) => { if (result && !signal?.aborted) detected(result.getText()); });
  if (signal?.aborted) { controls.stop(); throw new DOMException('Decoder cancelled', 'AbortError'); }
  return controls;
}
