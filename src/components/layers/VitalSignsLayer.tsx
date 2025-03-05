
import React from 'react';
import VitalSignsGrid from "@/components/VitalSignsGrid";

interface VitalSignsLayerProps {
  finalValues: any;
  vitalSigns: any;
  heartRate: number;
  measurementComplete: boolean;
}

const VitalSignsLayer: React.FC<VitalSignsLayerProps> = ({
  finalValues,
  vitalSigns,
  heartRate,
  measurementComplete
}) => {
  return (
    <div className="absolute z-20" style={{ bottom: '55px', left: 0, right: 0, padding: '0 8px' }}>
      <VitalSignsGrid 
        finalValues={finalValues}
        vitalSigns={vitalSigns}
        heartRate={heartRate}
        measurementComplete={measurementComplete}
      />
    </div>
  );
};

export default VitalSignsLayer;
