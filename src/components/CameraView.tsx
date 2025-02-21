
import React, { useRef, useEffect } from 'react';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
}

const CameraView = ({ onStreamReady }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ 
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            if (onStreamReady) {
              onStreamReady(stream);
            }
          }
        })
        .catch(err => console.error("Error accessing camera:", err));
    }
  }, [onStreamReady]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute top-0 left-0 min-w-full min-h-full w-auto h-auto object-cover z-0"
    />
  );
};

export default CameraView;
