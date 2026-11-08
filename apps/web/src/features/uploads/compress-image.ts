export interface ImageCompressionOptions {
  maxDimension: number;
  quality?: number;
}

interface DecodedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
  close?: () => void;
}

export interface ImageCompressionRuntime {
  decode: (file: File) => Promise<DecodedImage>;
  encode: (source: CanvasImageSource, width: number, height: number, quality: number) => Promise<Blob | null>;
}

function resizedDimensions(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

const browserRuntime: ImageCompressionRuntime = {
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  },
  async encode(source, width, height, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(source, 0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  },
};

export async function compressImageForUpload(
  file: File,
  options: ImageCompressionOptions,
  runtime: ImageCompressionRuntime = browserRuntime,
): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
  let decoded: DecodedImage | null = null;
  try {
    decoded = await runtime.decode(file);
    const dimensions = resizedDimensions(decoded.width, decoded.height, options.maxDimension);
    const encoded = await runtime.encode(decoded.source, dimensions.width, dimensions.height, options.quality ?? 0.82);
    if (!encoded) return file;
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([encoded], `${baseName}.webp`, { type: 'image/webp', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    decoded?.close?.();
  }
}
