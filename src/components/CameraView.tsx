
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
          width: isAndroid ? { ideal: 480, max: 640 } : { ideal: 1280 },
          height: isAndroid ? { ideal: 360, max: 480 } : { ideal: 720 },
          frameRate: isAndroid ? { ideal: 15, max: 30 } : { ideal: 30 },
          exposureMode: isAndroid ? 'manual' : 'auto',
          exposureTime: isAndroid ? 1000 : undefined,
          brightness: isAndroid ? 128 : undefined,
          contrast: isAndroid ? 128 : undefined
        }
      };

      console.log("Camera constraints:", { 
        isAndroid, 
        constraints,
        userAgent: navigator.userAgent 
      });

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);

      const videoTrack = newStream.getVideoTracks()[0];
      
      if (videoTrack.getCapabilities()?.torch) {
        await videoTrack.applyConstraints({
          advanced: [{ torch: true }]
        });
      }

      if (isAndroid) {
        const capabilities = videoTrack.getCapabilities();
        console.log("Camera capabilities:", capabilities);
        
        try {
          await videoTrack.applyConstraints({
            advanced: [{
              exposureMode: 'manual',
              exposureTime: 1000
            }]
          });
        } catch (err) {
          console.log("No se pudo ajustar exposición manual:", err);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      setStream(newStream);
      
      if (onStreamReady) {
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
