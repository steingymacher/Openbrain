import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Scan, X, CameraOff, RefreshCw } from 'lucide-react';
import { useTranslation } from '../lib/LanguageContext';

interface ScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function Scanner({ onScan, onClose }: ScannerProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const hasScanned = useRef(false);

  useEffect(() => {
    const startScanner = async () => {
      try {
        setIsInitializing(true);
        setError(null);
        
        const html5QrCode = new Html5Qrcode("reader");
        html5QrCodeRef.current = html5QrCode;

        const config = { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };

        const onScanSuccess = (decodedText: string) => {
          if (hasScanned.current) return;
          hasScanned.current = true;
          
          console.log(`Scanner success: ${decodedText}`);
          onScan(decodedText);
          stopScanner();
        };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          onScanSuccess,
          (errorMessage) => {
            // Ignore common scanning errors
          }
        );
        setIsInitializing(false);
      } catch (err: any) {
        console.error("Scanner error:", err);
        setError(
          err?.message?.includes("Permission") 
            ? t('camera_permission_denied')
            : t('camera_start_error')
        );
        setIsInitializing(false);
      }
    };

    const stopScanner = async () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (err) {
          console.error("Failed to stop scanner", err);
        }
      }
    };

    startScanner();

    return () => {
      stopScanner();
    };
  }, [onScan, t]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="p-4 flex justify-between items-center text-white">
        <div className="flex items-center gap-2">
          <Scan className="w-6 h-6" />
          <span className="font-bold">{t('scan_product')}</span>
        </div>
        <button onClick={onClose} className="p-2 bg-white/10 rounded-full">
          <X className="w-6 h-6" />
        </button>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="relative w-full max-w-md aspect-square overflow-hidden rounded-3xl border-2 border-white/20 bg-gray-900">
          <div id="reader" className="w-full h-full"></div>
          
          {isInitializing && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white gap-4">
              <RefreshCw className="w-10 h-10 animate-spin text-[#5A5A40]" />
              <p className="font-medium">{t('camera_initializing')}</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white p-8 text-center gap-4">
              <CameraOff className="w-12 h-12 text-red-500" />
              <p className="font-bold text-lg">{t('camera_error')}</p>
              <p className="text-sm text-gray-400">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-4 px-6 py-2 bg-[#5A5A40] rounded-full font-bold"
              >
                {t('reload')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-8 text-center text-white/60 text-sm">
        {error ? t('check_camera_permissions') : t('scan_instruction')}
      </div>
    </div>
  );
}
