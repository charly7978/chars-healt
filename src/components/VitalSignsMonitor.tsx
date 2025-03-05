
import React, { useEffect } from 'react';
import CameraView from './CameraView';

interface VitalSignsMonitorProps {
  isMonitoring: boolean;
  isCameraOn: boolean;
  permissionsGranted: boolean;
  signalQuality: number;
  lastSignal: any;
  onStreamReady: (stream: MediaStream) => void;
}

const VitalSignsMonitor: React.FC<VitalSignsMonitorProps> = ({
  isMonitoring,
  isCameraOn,
  permissionsGranted,
  signalQuality,
  lastSignal,
  onStreamReady
}) => {
  useEffect(() => {
    if (!isMonitoring && isCameraOn) {
      try {
        navigator.mediaDevices
          .getUserMedia({ video: true })
          .then(stream => {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack && videoTrack.getCapabilities()?.torch) {
              videoTrack.applyConstraints({
                advanced: [{ torch: false }]
              }).catch(err => console.error("Error desactivando linterna:", err));
            }
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(err => console.error("Error al intentar apagar la linterna:", err));
      } catch (err) {
        console.error("Error al acceder a la cámara para apagar la linterna:", err);
      }
    }
  }, [isMonitoring, isCameraOn]);

  return (
    <div className="absolute inset-0 z-0">
      <CameraView 
        onStreamReady={onStreamReady}
        isMonitoring={isCameraOn && permissionsGranted}
        isFingerDetected={isMonitoring ? lastSignal?.fingerDetected : false}
        signalQuality={isMonitoring ? signalQuality : 0}
      />
      <div 
        className="absolute inset-0" 
        style={{ 
          backgroundColor: 'rgba(0, 0, 0, 0.8)', 
          backdropFilter: 'blur(2px)' 
        }} 
      />
    </div>
  );
};

export default VitalSignsMonitor;
