import React from 'react';

interface CircularProgressProps {
  value: number;
  max: number;
  className?: string;
  strokeWidth?: number;
  color?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  max,
  className = '',
  strokeWidth = 2,
  color = '#0EA5E9'
}) => {
  // Calcular el porcentaje completado
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  // Calcular propiedades del círculo
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <svg
        className="transform -rotate-90"
        viewBox="0 0 24 24"
        width="100%"
        height="100%"
      >
        {/* Círculo de fondo */}
        <circle
          className="text-gray-200"
          cx="12"
          cy="12"
          r={radius}
          fill="transparent"
          strokeWidth={strokeWidth}
          stroke="currentColor"
        />
        
        {/* Círculo de progreso */}
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="transparent"
          strokeWidth={strokeWidth}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}; 