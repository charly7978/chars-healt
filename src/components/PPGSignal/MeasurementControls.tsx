
import React, { memo } from 'react';

interface MeasurementControlsProps {
  onStartMeasurement: () => void;
  onReset: () => void;
  isFingerDetected: boolean;
}

const MeasurementControls: React.FC<MeasurementControlsProps> = memo(({ 
  onStartMeasurement, 
  onReset, 
  isFingerDetected 
}) => {
  return (
    <div className="absolute bottom-0 left-0 right-0 flex justify-center items-center p-4 z-30">
      {isFingerDetected ? (
        <div className="flex space-x-3">
          <button
            onClick={onStartMeasurement}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-full transition duration-200"
          >
            Iniciar Medición
          </button>
          <button
            onClick={onReset}
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-full transition duration-200"
          >
            Reiniciar
          </button>
        </div>
      ) : (
        <div className="text-white font-bold text-center bg-black/50 p-3 rounded-lg backdrop-blur-sm">
          Coloque su dedo en la cámara para continuar
        </div>
      )}
    </div>
  );
});

MeasurementControls.displayName = 'MeasurementControls';

export default MeasurementControls;
