
import React from 'react';
import BottomControls from "@/components/BottomControls";

interface ControlsLayerProps {
  startMonitoring: () => void;
  handleReset: () => void;
  permissionsGranted: boolean;
  isMonitoring: boolean;
}

const ControlsLayer: React.FC<ControlsLayerProps> = ({
  startMonitoring,
  handleReset,
  permissionsGranted,
  isMonitoring
}) => {
  return (
    <div className="absolute z-50" style={{ bottom: 0, left: 0, right: 0, height: '45px' }}>
      <BottomControls
        startMonitoring={startMonitoring}
        handleReset={handleReset}
        permissionsGranted={permissionsGranted}
        isMonitoring={isMonitoring}
      />
    </div>
  );
};

export default ControlsLayer;
