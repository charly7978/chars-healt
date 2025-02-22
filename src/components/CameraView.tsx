
import React, { useRef, useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

const CameraView = ({ onStreamReady, isMonitoring, isFingerDetected = false, signalQuality = 0 }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const isAndroid = /Android/i.test(navigator.userAgent);

  const normalizeImageData = (imageData: ImageData): ImageData => {
    if (!isAndroid) return imageData;

    const data = new Uint8ClampedArray(imageData.data);
    const width = imageData.width;
    const height = imageData.height;
    
    // Solo para Android: normalizar valores RGB
    for (let i = 0; i < data.length; i += 4) {
      // Aplicar un factor de normalización más suave para el canal rojo
      data[i] = Math.min(255, Math.max(0, Math.round(data[i] * 0.85))); // Canal R
      data[i + 1] = data[i + 1]; // Canal G sin cambios
      data[i + 2] = data[i + 2]; // Canal B sin cambios
      data[i + 3] = 255; // Canal Alpha
    }

    return new ImageData(data, width, height);
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return normalizeImageData(originalImageData);
  };

  const stopCamera = async () => {
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach(track => {
        if (track.getCapabilities()?.torch) {
          track.applyConstraints({
            advanced: [{ torch: false }]
          }).catch(err => console.error("Error desactivando linterna:", err));
        }
        track.stop();
      });
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStream(null);
    }
  };

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia no está soportado");
      }

      const isAndroid = /Android/i.test(navigator.userAgent);
      
      const constraints = {
        video: {
          facingMode: 'environment',
          width: isAndroid ? { ideal: 640 } : { ideal: 1280 },
          height: isAndroid ? { ideal: 480 } : { ideal: 720 }
        }
      };

      console.log("Camera constraints:", { 
        isAndroid, 
        constraints,
        userAgent: navigator.userAgent 
      });

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = newStream.getVideoTracks()[0];
      
      // Log detallado de las capacidades de la cámara
      const capabilities = videoTrack.getCapabilities();
      const settings = videoTrack.getSettings();
      
      console.log("Camera Capabilities:", {
        capabilities,
        currentSettings: settings,
        trackLabel: videoTrack.label,
        trackConstraints: videoTrack.getConstraints()
      });

      // Log de los valores iniciales de los frames
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          console.log("Video metadata loaded:", {
            videoWidth: videoRef.current?.videoWidth,
            videoHeight: videoRef.current?.videoHeight,
            readyState: videoRef.current?.readyState,
            frameRate: settings.frameRate
          });
        };
      }
      
      if (videoTrack.getCapabilities()?.torch) {
        await videoTrack.applyConstraints({
          advanced: [{ torch: true }]
        });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      setStream(newStream);
      
      if (onStreamReady) {
        // Sobrescribimos el método getImageData del canvas para normalizar la señal
        const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function(...args) {
          const originalImageData = originalGetImageData.apply(this, args);
          
          // Log de los valores de píxeles para diagnóstico
          if (isAndroid) {
            const sampleSize = 1000;
            let redSum = 0;
            for (let i = 0; i < sampleSize * 4; i += 4) {
              redSum += originalImageData.data[i];
            }
            console.log("Image Data Sample:", {
              avgRedValue: redSum / sampleSize,
              width: originalImageData.width,
              height: originalImageData.height,
              timestamp: Date.now()
            });
          }
          
          return normalizeImageData(originalImageData);
        };

        onStreamReady(newStream);
      }
    } catch (err) {
      console.error("Error al iniciar la cámara:", err);
    }
  };

  useEffect(() => {
    if (isMonitoring && !stream) {
      startCamera();
    } else if (!isMonitoring && stream) {
      stopCamera();
    }
    return () => {
      // Restaurar el método original de getImageData
      if (isAndroid) {
        const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = originalGetImageData;
      }
      stopCamera();
    };
  }, [isMonitoring]);

  const getFingerColor = () => {
    if (!isFingerDetected) return 'text-gray-400';
    if (signalQuality > 75) return 'text-green-500';
    if (signalQuality > 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ objectFit: 'cover' }}
        className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0"
      />
      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        className="hidden"
      />
      {isMonitoring && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
          <Fingerprint
            size={64}
            className={`transition-colors duration-300 ${getFingerColor()}`}
          />
        </div>
      )}
    </>
  );
};

export default CameraView;
