'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

export function UpiQrCode({ value, label }: { value: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    let active = true;
    QRCode.toCanvas(canvas, value, {
      width: 208,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#FFFFFF' },
    }).then(() => {
      if (active) setError(false);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [value]);

  if (error) {
    return <p role="alert" style={{ color: 'var(--color-red)', fontSize: 13 }}>Could not generate QR code. Use the UPI link or copy the payment details.</p>;
  }
  return <canvas ref={canvasRef} role="img" aria-label={label} style={{ width: 208, height: 208, maxWidth: '100%', borderRadius: 12 }} />;
}
