import { describe, expect, it, vi } from 'vitest';
import { compressImageForUpload, type ImageCompressionRuntime } from './compress-image';

function imageFile(size: number, name = 'camera.png') {
  return new File([new Uint8Array(size)], name, { type: 'image/png', lastModified: 123 });
}

describe('compressImageForUpload', () => {
  it('resizes a large image and returns a smaller WebP file', async () => {
    const close = vi.fn();
    const runtime: ImageCompressionRuntime = {
      decode: vi.fn().mockResolvedValue({ width: 4000, height: 2000, source: {} as CanvasImageSource, close }),
      encode: vi.fn().mockResolvedValue(new Blob([new Uint8Array(500)], { type: 'image/webp' })),
    };

    const result = await compressImageForUpload(imageFile(5_000), { maxDimension: 1_000 }, runtime);

    expect(runtime.encode).toHaveBeenCalledWith(expect.anything(), 1_000, 500, 0.82);
    expect(result.name).toBe('camera.webp');
    expect(result.type).toBe('image/webp');
    expect(result.size).toBe(500);
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps the original only when decoding fails and still re-encodes a larger metadata-free result', async () => {
    const original = imageFile(1_000);
    const decodeFailure: ImageCompressionRuntime = {
      decode: vi.fn().mockRejectedValue(new Error('unsupported decoder')),
      encode: vi.fn(),
    };
    const largerResult: ImageCompressionRuntime = {
      decode: vi.fn().mockResolvedValue({ width: 2_000, height: 1_000, source: {} as CanvasImageSource }),
      encode: vi.fn().mockResolvedValue(new Blob([new Uint8Array(1_500)], { type: 'image/webp' })),
    };

    await expect(compressImageForUpload(original, { maxDimension: 512 }, decodeFailure)).resolves.toBe(original);
    const reencoded = await compressImageForUpload(original, { maxDimension: 512 }, largerResult);
    expect(reencoded).not.toBe(original);
    expect(reencoded.type).toBe('image/webp');
    expect(reencoded.size).toBe(1_500);
  });

  it('re-encodes compact images to strip source metadata', async () => {
    const original = imageFile(200, 'metadata-bearing.jpg');
    const runtime: ImageCompressionRuntime = {
      decode: vi.fn().mockResolvedValue({ width: 128, height: 128, source: {} as CanvasImageSource }),
      encode: vi.fn().mockResolvedValue(new Blob([new Uint8Array(240)], { type: 'image/webp' })),
    };

    const result = await compressImageForUpload(original, { maxDimension: 512 }, runtime);

    expect(runtime.encode).toHaveBeenCalledWith(expect.anything(), 128, 128, 0.82);
    expect(result.name).toBe('metadata-bearing.webp');
    expect(result).not.toBe(original);
  });
});
