
import React from 'react';
import VitalSign from './VitalSign';

interface VitalSignsDisplayProps {
  finalValues: {
    heartRate: number;
    spo2: number;
    pressure: string;
  } | null;
  currentValues: {
    heartRate: number;
    spo2: number;
    pressure: string;
    arrhythmiaStatus: string;
  };
  isFinalReading: boolean;
}

const VitalSignsDisplay: React.FC<VitalSignsDisplayProps> = ({
  finalValues,
  currentValues,
  isFinalReading
}) => {
  return (
    <>
      <VitalSign 
        label="FRECUENCIA CARDÍACA"
        value={finalValues ? finalValues.heartRate : currentValues.heartRate || "--"}
        unit="BPM"
      />
      <VitalSign 
        label="SPO2"
        value={finalValues ? finalValues.spo2 : currentValues.spo2 || "--"}
        unit="%"
      />
      <VitalSign 
        label="PRESIÓN ARTERIAL"
        value={finalValues ? finalValues.pressure : currentValues.pressure}
        unit="mmHg"
      />
      <VitalSign 
        label="ARRITMIAS"
        value={currentValues.arrhythmiaStatus}
      />
    </>
  );
};

export default VitalSignsDisplay;
