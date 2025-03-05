
import React from 'react';
import CameraView from "@/components/CameraView";
import { SignalData } from '@/types/signal';

interface CameraBackgroundLayerProps {
  handleStreamReady: (stream: MediaStream) => void;
  isCameraOn: boolean;
  permissionsGranted: boolean;
  isMonitoring: boolean;
  lastSignal?: SignalData | null;
  signalQuality: number;
}

const CameraBackgroundLayer: React.FC<CameraBackgroundLayerProps> = ({
  handleStreamReady,
  isCameraOn,
  permissionsGranted,
  isMonitoring,
  lastSignal,
  signalQuality
}) => {
  return (
    <div className="absolute inset-0 z-0">
      <CameraView 
        onStreamReady={handleStreamReady}
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

export default CameraBackgroundLayer;
