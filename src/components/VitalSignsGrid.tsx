
import React from 'react';
import VitalSign from "@/components/VitalSign";

interface VitalSignsGridProps {
  finalValues: {
    heartRate: number;
    spo2: number;
    pressure: string;
    respiration: {
      rate: number;
      depth: number;
      regularity: number;
    };
    glucose: {
      value: number;
      trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
    };
    lipids: {
      totalCholesterol: number;
      hdl: number;
      ldl: number;
      triglycerides: number;
    } | null;
  } | null;
  vitalSigns: {
    spo2: number;
    pressure: string;
    arrhythmiaStatus: string;
    respiration: {
      rate: number;
      depth: number;
      regularity: number;
    };
    hasRespirationData: boolean;
    glucose: any;
    lipids: {
      totalCholesterol: number;
      hdl: number;
      ldl: number;
      triglycerides: number;
    } | null;
  };
  heartRate: number;
  measurementComplete: boolean;
}

const VitalSignsGrid: React.FC<VitalSignsGridProps> = ({
  finalValues,
  vitalSigns,
  heartRate,
  measurementComplete
}) => {
  return (
    <div className="p-1 rounded-lg">
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
        <VitalSign 
          label="FRECUENCIA CARDÍACA"
          value={finalValues ? finalValues.heartRate : heartRate || "--"}
          unit="BPM"
          isFinalReading={measurementComplete}
        />
        <VitalSign 
          label="SPO2"
          value={finalValues ? finalValues.spo2 : vitalSigns.spo2 || "--"}
          unit="%"
          isFinalReading={measurementComplete}
        />
        <VitalSign 
          label="PRESIÓN ARTERIAL"
          value={finalValues ? finalValues.pressure : vitalSigns.pressure}
          unit="mmHg"
          isFinalReading={measurementComplete}
        />
        <VitalSign 
          label="ARRITMIAS"
          value={vitalSigns.arrhythmiaStatus}
          isFinalReading={measurementComplete}
        />
        <VitalSign 
          label="RESPIRACIÓN"
          value={finalValues ? finalValues.respiration.rate : (vitalSigns.hasRespirationData ? vitalSigns.respiration.rate : "--")}
          unit="RPM"
          secondaryValue={finalValues ? finalValues.respiration.depth : (vitalSigns.hasRespirationData ? vitalSigns.respiration.depth : "--")}
          secondaryUnit="%"
          isFinalReading={measurementComplete}
        />
        <VitalSign 
          label="LÍPIDOS"
          value={vitalSigns.lipids ? vitalSigns.lipids.totalCholesterol : "--"}
          unit="mg/dL"
          secondaryValue={vitalSigns.lipids ? `HDL: ${vitalSigns.lipids.hdl}` : "--"}
          isFinalReading={measurementComplete}
        />
      </div>
    </div>
  );
};

export default VitalSignsGrid;
