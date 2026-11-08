import React, { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface QrScannerComponentProps {
  onResult?: (result: { text: string } | null, error?: any) => void;
  scanDelay?: number;
  facingMode?: "environment" | "user";
}

export const QrCodeScannerComponent: React.FC<QrScannerComponentProps> = ({
  onResult,
  scanDelay = 400,
  facingMode = "environment",
}) => {
  const containerIdRef = useRef(`qr-reader-container-${Math.random().toString(36).substring(2, 9)}`);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    let isMounted = true;
    const elementId = containerIdRef.current;
    const scanner = new Html5Qrcode(elementId);
    html5QrcodeRef.current = scanner;

    const fps = Math.max(1, Math.min(30, Math.round(1000 / (scanDelay || 400))));

    const startCamera = async () => {
      try {
        await scanner.start(
          { facingMode },
          {
            fps,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const minDim = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.floor(minDim * 0.75);
              return { width: Math.max(140, size), height: Math.max(140, size) };
            },
          },
          (decodedText) => {
            if (isMounted && decodedText && onResult) {
              onResult({ text: decodedText });
            }
          },
          () => {
            // Ignore scan attempt failure (normal when no code in frame)
          }
        );
      } catch (err) {
        console.warn("[QR Scanner] Camera start exception:", err);
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (html5QrcodeRef.current) {
        const activeScanner = html5QrcodeRef.current;
        if (activeScanner.isScanning) {
          activeScanner
            .stop()
            .catch(() => {})
            .finally(() => {
              try {
                activeScanner.clear();
              } catch {}
            });
        } else {
          try {
            activeScanner.clear();
          } catch {}
        }
      }
    };
  }, [facingMode, scanDelay]);

  return (
    <div
      id={containerIdRef.current}
      className="w-full h-full relative overflow-hidden bg-slate-950 flex items-center justify-center [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
    />
  );
};

export default QrCodeScannerComponent;
