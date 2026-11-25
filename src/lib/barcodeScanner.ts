import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

interface NativeBarcodeResult {
  rawValue?: string;
  format?: string;
}

interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<NativeBarcodeResult[]>;
}

interface NativeBarcodeDetectorCtor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
}

export interface DetectedScanCode {
  isbn: string;
  kind: 'BARCODE' | 'QRCBN';
  rawValue: string;
}

/**
 * Extracts a 10- or 13-digit ISBN from either a standard 1D barcode
 * or a 2D QRCBN / Perpusnas QR payload (which may contain URLs or formatted text).
 */
export function normalizeScannedIsbn(rawText: string): string | null {
  if (!rawText || typeof rawText !== 'string') return null;

  // 1. Check for ISBN-13 (978 or 979 prefix, allowing hyphens/spaces inside QRCBN payloads)
  const isbn13Match = rawText.match(/(?:97[89])(?:[\s-]?\d){10}/);
  if (isbn13Match) {
    const digits = isbn13Match[0].replace(/[^0-9]/g, '');
    if (digits.length === 13) {
      return digits;
    }
  }

  // 2. Check for explicit ISBN-10 inside text/URLs
  const isbn10Match = rawText.match(/\b\d(?:[\s-]?\d){8}[\s-]?[0-9Xx]\b/);
  if (isbn10Match) {
    const digits = isbn10Match[0].replace(/[^0-9Xx]/g, '').toUpperCase();
    if (digits.length === 10) {
      return digits;
    }
  }

  // 3. Fallback: direct cleanup of entire string
  const cleaned = rawText.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (
    cleaned.length === 13 &&
    (cleaned.startsWith('978') || cleaned.startsWith('979'))
  ) {
    return cleaned;
  }
  if (cleaned.length === 10 || cleaned.length === 13) {
    return cleaned;
  }

  return null;
}

export function createZxingBarcodeReader(): BrowserMultiFormatReader {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.CODE_128,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

export function createNativeBarcodeDetector(): NativeBarcodeDetector | null {
  try {
    const win = window as unknown as {
      BarcodeDetector?: NativeBarcodeDetectorCtor;
    };
    if (typeof win.BarcodeDetector === 'function') {
      return new win.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'qr_code', 'data_matrix'],
      });
    }
  } catch {
    // Fallback to ZXing
  }
  return null;
}

export async function detectCodeFromVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  zxingReader: BrowserMultiFormatReader,
  nativeDetector: NativeBarcodeDetector | null
): Promise<DetectedScanCode | null> {
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  // 1. Hardware-accelerated BarcodeDetector (supports 1D barcodes & 2D QR/QRCBN)
  if (nativeDetector) {
    try {
      const detected = await nativeDetector.detect(video);
      for (const item of detected) {
        if (item.rawValue) {
          const isbn = normalizeScannedIsbn(item.rawValue);
          if (isbn) {
            const fmt = (item.format ?? '').toLowerCase();
            const isQr = fmt.includes('qr') || fmt.includes('matrix') || item.rawValue.includes('http');
            return {
              isbn,
              kind: isQr ? 'QRCBN' : 'BARCODE',
              rawValue: item.rawValue,
            };
          }
        }
      }
    } catch {
      // Continue to ZXing fallback
    }
  }

  // 2. ZXing full-frame scan (1D barcodes + QRCBN)
  const targetW = Math.min(960, video.videoWidth);
  const targetH = Math.round((video.videoHeight / video.videoWidth) * targetW);
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, targetW, targetH);

  try {
    const result = zxingReader.decodeFromCanvas(canvas);
    const rawValue = result.getText();
    const isbn = normalizeScannedIsbn(rawValue);
    if (isbn) {
      const fmt = result.getBarcodeFormat();
      const isQr =
        fmt === BarcodeFormat.QR_CODE ||
        fmt === BarcodeFormat.DATA_MATRIX ||
        rawValue.includes('http');
      return {
        isbn,
        kind: isQr ? 'QRCBN' : 'BARCODE',
        rawValue,
      };
    }
  } catch {
    // Try center-cropped region next
  }

  // 3. ZXing center region scan (helps lock onto centered barcode/QRCBN on busy covers)
  const bandW = Math.round(targetW * 0.72);
  const bandH = Math.round(targetH * 0.52);
  const bandX = Math.round((targetW - bandW) / 2);
  const bandY = Math.round((targetH - bandH) / 2);

  const bandCanvas = document.createElement('canvas');
  bandCanvas.width = bandW;
  bandCanvas.height = bandH;
  const bandCtx = bandCanvas.getContext('2d', { willReadFrequently: true });
  if (bandCtx) {
    bandCtx.drawImage(canvas, bandX, bandY, bandW, bandH, 0, 0, bandW, bandH);
    try {
      const bandResult = zxingReader.decodeFromCanvas(bandCanvas);
      const rawValue = bandResult.getText();
      const isbn = normalizeScannedIsbn(rawValue);
      if (isbn) {
        const fmt = bandResult.getBarcodeFormat();
        const isQr =
          fmt === BarcodeFormat.QR_CODE ||
          fmt === BarcodeFormat.DATA_MATRIX ||
          rawValue.includes('http');
        return {
          isbn,
          kind: isQr ? 'QRCBN' : 'BARCODE',
          rawValue,
        };
      }
    } catch {
      // No barcode/QRCBN found in current frame
    }
  }

  return null;
}
