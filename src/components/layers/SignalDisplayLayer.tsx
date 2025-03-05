
import React from 'react';
import PPGSignalMeter from "@/components/PPGSignalMeter";
import { SignalData } from '@/types/signal';

interface SignalDisplayLayerProps {
  isMonitoring: boolean;
  lastSignal?: SignalData | null;
  startMonitoring: () => void;
  handleReset: () => void;
  vitalSigns: any;
  lastArrhythmiaData: any;
}

const SignalDisplayLayer: React.FC<SignalDisplayLayerProps> = ({
  isMonitoring,
  lastSignal,
  startMonitoring,
  handleReset,
  vitalSigns,
  lastArrhythmiaData
}) => {
  return (
    <div className="absolute inset-0 z-10">
      <PPGSignalMeter 
        value={isMonitoring ? lastSignal?.filteredValue || 0 : 0}
        quality={isMonitoring ? lastSignal?.quality || 0 : 0}
        isFingerDetected={isMonitoring ? lastSignal?.fingerDetected || false : false}
        onStartMeasurement={startMonitoring}
        onReset={handleReset}
        arrhythmiaStatus={vitalSigns.arrhythmiaStatus}
        rawArrhythmiaData={lastArrhythmiaData}
        lipidData={vitalSigns.lipids}
      />
    </div>
  );
};

export default SignalDisplayLayer;
