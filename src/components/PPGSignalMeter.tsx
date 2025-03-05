
import React, { memo } from 'react';
import SignalQualityIndicator from './PPGSignal/SignalQualityIndicator';
import LipidDataDisplay from './PPGSignal/LipidDataDisplay';
import SignalCanvas from './PPGSignal/SignalCanvas';
import CharsHealtHeader from './PPGSignal/CharsHealtHeader';
import MeasurementControls from './PPGSignal/MeasurementControls';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus?: string;
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
  lipidData?: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides: number;
  } | null;
}

const PPGSignalMeter: React.FC<PPGSignalMeterProps> = memo(({ 
  value, 
  quality, 
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData,
  lipidData
}) => {
  return (
    <>
      <SignalQualityIndicator 
        quality={quality} 
        isFingerDetected={isFingerDetected} 
      />

      <SignalCanvas 
        value={value} 
        quality={quality} 
        isFingerDetected={isFingerDetected}
        arrhythmiaStatus={arrhythmiaStatus}
        rawArrhythmiaData={rawArrhythmiaData}
      />
      
      <LipidDataDisplay lipidData={lipidData} />
      
      <MeasurementControls
        onStartMeasurement={onStartMeasurement}
        onReset={onReset}
        isFingerDetected={isFingerDetected}
      />
      
      <CharsHealtHeader />
    </>
  );
});

PPGSignalMeter.displayName = 'PPGSignalMeter';

export default PPGSignalMeter;
