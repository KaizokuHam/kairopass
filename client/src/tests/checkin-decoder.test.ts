import { describe, expect, it, vi } from 'vitest';
import { BrowserQRCodeReader } from '@zxing/browser';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import { qrPayload } from './checkin-fixtures';
import { startQrDecoder } from '@/lib/qr-scanner';
describe('real ZXing QR image decoding (independent of camera mocks)', () => {
  it('does not initialize an obsolete decoder or attach a video after cancellation', async () => {
    const controller = new AbortController(); controller.abort(); const video = document.createElement('video');
    await expect(startQrDecoder({} as MediaStream, video, () => {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(video.srcObject).toBeFalsy();
  });
  it('decodes an actual generated PNG image to the exact signed-credential bytes', () => {
    const matrix = QRCode.create(qrPayload, { errorCorrectionLevel: 'Q' }).modules;
    const scale = 6, width = (matrix.size + 8) * scale, pixels = Buffer.alloc(width * width * 4, 255);
    for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) if (matrix.get(y, x)) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + 4) * scale + dy) * width + (x + 4) * scale + dx) * 4; pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0;
    }
    const image = new PNG({ width, height: width }); image.data = pixels;
    const pngBytes = PNG.sync.write(image);
    expect(pngBytes.subarray(1, 4).toString()).toBe('PNG'); const decodedImage = PNG.sync.read(pngBytes);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = width;
    vi.spyOn(canvas, 'getContext').mockReturnValue({ getImageData: () => ({ data: new Uint8ClampedArray(decodedImage.data), width, height: width }) } as unknown as CanvasRenderingContext2D);
    const result = new BrowserQRCodeReader().decodeFromCanvas(canvas);
    expect(result.getText()).toBe(qrPayload);
  });
});
