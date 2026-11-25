export interface CompressedImagePair {
  aiDataUrl: string;
  thumbnailDataUrl: string;
  sizeKB: number;
}

function loadImageFromSource(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar untuk kompresi.'));
    img.src = src;
  });
}

function resizeOnCanvas(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  maxDimension: number,
  quality: number
): string {
  let targetW = srcWidth;
  let targetH = srcHeight;

  if (srcWidth > maxDimension || srcHeight > maxDimension) {
    if (srcWidth >= srcHeight) {
      targetW = maxDimension;
      targetH = Math.max(1, Math.round((srcHeight / srcWidth) * maxDimension));
    } else {
      targetH = maxDimension;
      targetW = Math.max(1, Math.round((srcWidth / srcHeight) * maxDimension));
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D tidak tersedia.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(source, 0, 0, targetW, targetH);

  return canvas.toDataURL('image/jpeg', quality);
}

export function estimateDataUrlKB(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return Math.max(1, Math.round((base64.length * 3) / 4 / 1024));
}

export function compressVideoFrame(video: HTMLVideoElement): CompressedImagePair {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;

  const aiDataUrl = resizeOnCanvas(video, width, height, 1280, 0.78);
  const thumbnailDataUrl = resizeOnCanvas(video, width, height, 420, 0.75);

  return {
    aiDataUrl,
    thumbnailDataUrl,
    sizeKB: estimateDataUrlKB(aiDataUrl),
  };
}

export async function compressImageFile(file: File): Promise<CompressedImagePair> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageFromSource(objectUrl);
    const width = img.naturalWidth || 1200;
    const height = img.naturalHeight || 1600;

    const aiDataUrl = resizeOnCanvas(img, width, height, 1280, 0.82);
    const thumbnailDataUrl = resizeOnCanvas(img, width, height, 420, 0.75);

    return {
      aiDataUrl,
      thumbnailDataUrl,
      sizeKB: estimateDataUrlKB(aiDataUrl),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
