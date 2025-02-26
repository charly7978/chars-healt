
import React from 'react';
import VitalSign from './VitalSign';

interface VitalSignsDisplayProps {
  heartRate: number;
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
}

const VitalSignsDisplay: React.FC<VitalSignsDisplayProps> = ({
  heartRate,
  spo2,
  pressure,
  arrhythmiaStatus
}) => {
  return (
    <div className="px-4 pt-8">
      <div className="bg-black rounded-xl p-4 mb-4 shadow-xl">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <VitalSign 
            label="FRECUENCIA CARDÍACA"
            value={heartRate || "--"}
            unit="BPM"
          />
          <VitalSign 
            label="SPO2"
            value={spo2 || "--"}
            unit="%"
          />
          <VitalSign 
            label="PRESIÓN ARTERIAL"
            value={pressure}
            unit="mmHg"
          />
          <VitalSign 
            label="ARRITMIAS"
            value={arrhythmiaStatus}
          />
        </div>
      </div>
    </div>
  );
};

export default VitalSignsDisplay;
