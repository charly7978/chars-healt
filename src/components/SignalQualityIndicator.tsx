
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
    <div className="bg-black/30 backdrop-blur-md rounded p-2 w-full">
      <div className="flex items-center gap-2">
        {/* Indicador circular */}
        <div 
          className="w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300"
          style={{
            borderColor: getQualityColor(quality),
            backgroundColor: `${getQualityColor(quality)}33`
          }}
        >
          <span className="text-sm font-bold text-white">{quality}%</span>
        </div>

        <div className="flex-1">
          {/* Texto de calidad */}
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-semibold text-white/90">Calidad de Señal</span>
            <span 
              className="text-xs font-medium"
              style={{ color: getQualityColor(quality) }}
            >
              {getQualityText(quality)}
            </span>
          </div>

          {/* Barra de progreso */}
          <div className="w-full h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
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
    </div>
  );
};

export default SignalQualityIndicator;
