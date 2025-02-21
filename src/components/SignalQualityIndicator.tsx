
import React from 'react';

interface SignalQualityIndicatorProps {
  quality: number;
}

const SignalQualityIndicator = ({ quality }: SignalQualityIndicatorProps) => {
  const getQualityColor = (quality: number) => {
    if (quality > 75) return '#ff0000';
    if (quality > 50) return '#ff4444';
    return '#ff8888';
  };

  const getQualityText = (quality: number) => {
    if (quality > 75) return 'Excelente';
    if (quality > 50) return 'Buena';
    return 'Baja';
  };

  return (
    <div className="bg-black/30 backdrop-blur-md rounded-lg p-4 w-full">
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm font-semibold text-white/90">Calidad de Señal</div>
        
        {/* Indicador circular grande */}
        <div 
          className="w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all duration-300"
          style={{
            borderColor: getQualityColor(quality),
            backgroundColor: `${getQualityColor(quality)}33`
          }}
        >
          <span className="text-2xl font-bold text-white">{quality}%</span>
        </div>

        {/* Texto de calidad */}
        <div 
          className="text-sm font-medium"
          style={{ color: getQualityColor(quality) }}
        >
          {getQualityText(quality)}
        </div>

        {/* Barra de progreso */}
        <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden">
          <div 
            className="h-full transition-all duration-300"
            style={{
              width: `${quality}%`,
              backgroundColor: getQualityColor(quality)
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default SignalQualityIndicator;
