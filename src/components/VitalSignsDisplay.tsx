
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
    <div className="fixed bottom-[65px] left-0 right-0 px-3 z-20">
      <div className="p-2 bg-black/60 rounded-lg">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          <VitalSign 
            label="FRECUENCIA CARDÍACA"
            value={finalValues ? finalValues.heartRate : currentValues.heartRate || "--"}
            unit="BPM"
            isFinalReading={isFinalReading}
          />
          <VitalSign 
            label="SPO2"
            value={finalValues ? finalValues.spo2 : currentValues.spo2 || "--"}
            unit="%"
            isFinalReading={isFinalReading}
          />
          <VitalSign 
            label="PRESIÓN ARTERIAL"
            value={finalValues ? finalValues.pressure : currentValues.pressure}
            unit="mmHg"
            isFinalReading={isFinalReading}
          />
          <VitalSign 
            label="ARRITMIAS"
            value={currentValues.arrhythmiaStatus}
            isFinalReading={isFinalReading}
          />
        </div>
      </div>
    </div>
  );
};

export default VitalSignsDisplay;
