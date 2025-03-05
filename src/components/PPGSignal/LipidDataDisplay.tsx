
import React, { memo } from 'react';

interface LipidDataDisplayProps {
  lipidData?: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides: number;
  } | null;
}

const LipidDataDisplay: React.FC<LipidDataDisplayProps> = memo(({ lipidData }) => {
  if (!lipidData) return null;
  
  return (
    <div className="absolute left-2 top-20 p-4 z-30 bg-black/50 backdrop-blur-sm rounded-lg">
      <h3 className="text-white text-lg font-bold mb-2">Lípidos en Sangre</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="text-white">
          <p className="text-sm font-semibold">Colesterol Total</p>
          <p className="text-xl font-bold">{lipidData.totalCholesterol} <span className="text-sm">mg/dL</span></p>
        </div>
        <div className="text-white">
          <p className="text-sm font-semibold">HDL</p>
          <p className="text-xl font-bold">{lipidData.hdl} <span className="text-sm">mg/dL</span></p>
        </div>
        <div className="text-white">
          <p className="text-sm font-semibold">LDL</p>
          <p className="text-xl font-bold">{lipidData.ldl} <span className="text-sm">mg/dL</span></p>
        </div>
        <div className="text-white">
          <p className="text-sm font-semibold">Triglicéridos</p>
          <p className="text-xl font-bold">{lipidData.triglycerides} <span className="text-sm">mg/dL</span></p>
        </div>
      </div>
    </div>
  );
});

LipidDataDisplay.displayName = 'LipidDataDisplay';

export default LipidDataDisplay;
