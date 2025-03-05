
import React, { useEffect } from 'react';
import { useCamera } from '../hooks/useCamera';
import VideoDisplay from './camera/VideoDisplay';
import CameraError from './camera/CameraError';

interface CameraViewProps {
  onStreamReady?: (stream: MediaStream) => void;
  isMonitoring: boolean;
  isFingerDetected?: boolean;
  signalQuality?: number;
}

const CameraView: React.FC<CameraViewProps> = ({
  onStreamReady,
  isMonitoring,
  isFingerDetected = false,
  signalQuality = 0,
}) => {
  const {
    videoRef,
    mountedRef,
    error,
    isAndroid,
    detectAndroid,
    startCamera,
    stopCamera
  } = useCamera({ onStreamReady, isMonitoring });

  // Detect Android on mount
  useEffect(() => {
    detectAndroid();
  }, [detectAndroid]);

  // Effect to start/stop camera when isMonitoring changes
  useEffect(() => {
    console.log("CameraView: isMonitoring changed to:", isMonitoring);
    
    if (isMonitoring) {
      // Use a longer timeout for Android
      const timeoutId = setTimeout(() => {
        startCamera();
      }, isAndroid ? 500 : 100);
      return () => clearTimeout(timeoutId);
    } else {
      stopCamera();
    }
  }, [isMonitoring, startCamera, stopCamera, isAndroid]);

  // Cleanup effect when mounting/unmounting component
  useEffect(() => {
    mountedRef.current = true;
    console.log("CameraView: Component mounted");

    // Make sure camera permissions are available
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(stream => {
        // Just checking permissions, stop stream immediately
        stream.getTracks().forEach(track => track.stop());
        console.log("CameraView: Camera permissions verified");
      })
      .catch(err => {
        console.error("CameraView: Error verifying camera permissions:", err);
      });

    return () => {
      console.log("CameraView: Component unmounting");
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <>
      <VideoDisplay 
        videoRef={videoRef} 
        isMonitoring={isMonitoring} 
        isAndroid={isAndroid} 
      />
      <CameraError error={error} />
    </>
  );
};

export default React.memo(CameraView);
