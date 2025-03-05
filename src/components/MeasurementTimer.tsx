
import React from 'react';

interface MeasurementTimerProps {
  isMonitoring: boolean;
  elapsedTime: number;
}

const MeasurementTimer: React.FC<MeasurementTimerProps> = ({ 
  isMonitoring, 
  elapsedTime 
}) => {
  if (!isMonitoring) {
    return null;
  }
  
  return (
    <div className="absolute bottom-40 left-0 right-0 text-center z-30">
      <span className="text-xl font-medium text-gray-300">{elapsedTime}s / 40s</span>
    </div>
  );
};

export default MeasurementTimer;
