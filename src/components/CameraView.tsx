
import React, { useRef, useEffect, useState, useCallback } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

const CameraView = ({ 
  onStreamReady, 
  isMonitoring, 
  isFingerDetected = false, 
  signalQuality = 0,
}: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRequestRef = useRef<ReturnType<typeof requestAnimationFrame>>();

  const stopCamera = useCallback(async () => {
    if (streamRequestRef.current) {
      cancelAnimationFrame(streamRequestRef.current);
      streamRequestRef.current = undefined;
    }
    
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStream(null);
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia no está soportado");
      }

      const isAndroid = /android/i.test(navigator.userAgent);
      
      // Mantener resolución más alta para SPO2
      const videoConstraints: MediaTrackConstraints = {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      const videoTrack = stream.getVideoTracks()[0];

      if (videoTrack && isAndroid) {
        try {
          await videoTrack.applyConstraints({
            advanced: [
              { exposureMode: 'continuous' },
              { focusMode: 'continuous' },
              { whiteBalanceMode: 'continuous' }
            ]
          });
        } catch (err) {
          console.log("Algunas optimizaciones no están disponibles");
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setStream(stream);
      
      if (onStreamReady) {
        onStreamReady(stream);
      }
    } catch (err) {
      console.error("Error al iniciar la cámara:", err);
    }
  }, [onStreamReady]);

  useEffect(() => {
    if (isMonitoring && !stream) {
      startCamera();
    } else if (!isMonitoring && stream) {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isMonitoring, stream, startCamera, stopCamera]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto z-0 object-cover"
    />
  );
};

export default React.memo(CameraView);
