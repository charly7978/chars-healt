
import React from 'react';
import VitalSign from './VitalSign';
import { VitalSigns, FinalValues } from '@/hooks/useVitalMeasurement';

interface VitalSignsDisplayProps {
  vitalSigns: VitalSigns;
  heartRate: number;
  finalValues: FinalValues | null;
  measurementComplete: boolean;
}

const VitalSignsDisplay: React.FC<VitalSignsDisplayProps> = ({
  vitalSigns,
  heartRate,
  finalValues,
  measurementComplete
}) => {
  return (
    <div className="absolute z-20" style={{ bottom: '65px', left: 0, right: 0, padding: '0 12px' }}>
      <div className="p-2 rounded-lg">
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-7">
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
            label="GLUCOSA"
            value={finalValues?.glucose?.value || (vitalSigns.glucose?.value || "--")}
            unit="mg/dL"
            trend={finalValues?.glucose?.trend || (vitalSigns.glucose?.trend || "unknown")}
            isFinalReading={measurementComplete}
            glucose={null}
          />
          <VitalSign 
            label="HEMOGLOBINA"
            value={finalValues?.hemoglobin || vitalSigns.hemoglobin || "--"}
            unit="g/dL"
            isFinalReading={measurementComplete}
          />
        </div>
      </div>
    </div>
  );
};

export default VitalSignsDisplay;
