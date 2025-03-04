import React from 'react';
import { ArrowUp, ArrowDown, ArrowRight, Thermometer } from 'lucide-react';
import { cn } from '../lib/utils';

interface VitalSignProps {
  label: string;
  value: number | string;
  unit?: string;
  secondaryValue?: number | string;
  secondaryUnit?: string;
  trend?: 'rising' | 'falling' | 'stable' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  isFinalReading?: boolean;
  arrhythmiaCount?: number | string;
  cholesterolData?: {
    hdl: number;
    ldl: number;
    triglycerides: number;
  };
  temperatureLocation?: 'forehead' | 'wrist' | 'finger';
  temperatureTrend?: 'rising' | 'falling' | 'stable';
}

const VitalSign: React.FC<VitalSignProps> = ({
  label,
  value,
  unit,
  secondaryValue,
  secondaryUnit,
  trend,
  isFinalReading = false,
  arrhythmiaCount,
  cholesterolData,
  temperatureLocation,
  temperatureTrend
}) => {
  const getColorClass = () => {
    if (label === 'FRECUENCIA CARDÍACA') {
      const numValue = typeof value === 'number' ? value : parseInt(value as string, 10);
      if (isNaN(numValue) || numValue === 0) return 'text-gray-400';
      if (numValue < 60) return 'text-yellow-500';
      if (numValue > 100) return 'text-orange-500';
      if (numValue > 120) return 'text-red-500';
      return 'text-green-500';
    }
    
    if (label === 'SPO2') {
      const numValue = typeof value === 'number' ? value : parseInt(value as string, 10);
      if (isNaN(numValue) || numValue === 0) return 'text-gray-400';
      if (numValue < 92) return 'text-red-500';
      if (numValue < 95) return 'text-orange-500';
      return 'text-green-500';
    }
    
    if (label === 'PRESIÓN ARTERIAL') {
      if (value === '--/--') return 'text-gray-400';
      const parts = (value as string).split('/');
      if (parts.length !== 2) return 'text-gray-400';
      
      const systolic = parseInt(parts[0], 10);
      const diastolic = parseInt(parts[1], 10);
      
      if (systolic > 140 || diastolic > 90) return 'text-red-500';
      if (systolic > 130 || diastolic > 85) return 'text-orange-500';
      if (systolic < 100 || diastolic < 60) return 'text-yellow-500';
      return 'text-green-500';
    }
    
    if (label === 'RESPIRACIÓN') {
      const numValue = typeof value === 'number' ? value : parseInt(value as string, 10);
      if (isNaN(numValue) || numValue === 0) return 'text-gray-400';
      if (numValue < 12) return 'text-yellow-500';
      if (numValue > 20) return 'text-orange-500';
      if (numValue > 25) return 'text-red-500';
      return 'text-green-500';
    }
    
    if (label === 'GLUCOSA') {
      const numValue = typeof value === 'number' ? value : parseInt(value as string, 10);
      if (isNaN(numValue) || numValue === 0) return 'text-gray-400';
      if (numValue < 70) return 'text-red-500';
      if (numValue < 80) return 'text-yellow-500';
      if (numValue > 140) return 'text-orange-500';
      if (numValue > 180) return 'text-red-500';
      return 'text-green-500';
    }
    
    if (label === 'HEMOGLOBINA') {
      const numValue = typeof value === 'number' ? value : parseFloat(value as string);
      if (isNaN(numValue) || numValue === 0) return 'text-gray-400';
      if (numValue < 12) return 'text-red-500';
      if (numValue < 13) return 'text-yellow-500';
      if (numValue > 16.5) return 'text-yellow-500';
      if (numValue > 18) return 'text-orange-500';
      return 'text-green-500';
    }
    
    if (label === 'COLESTEROL') {
      const numValue = typeof value === 'number' ? value : parseInt(value as string, 10);
      if (isNaN(numValue) || numValue === 0) return 'text-gray-400';
      if (numValue > 240) return 'text-red-500';
      if (numValue > 200) return 'text-orange-500';
      if (numValue < 140) return 'text-yellow-500';
      return 'text-green-500';
    }
    
    if (label === 'TEMPERATURA') {
      const numValue = typeof value === 'number' ? value : parseFloat(value as string);
      if (isNaN(numValue) || numValue === 0) return 'text-gray-400';
      if (numValue > 38.0) return 'text-red-500';
      if (numValue > 37.5) return 'text-orange-500';
      if (numValue < 36.0) return 'text-yellow-500';
      return 'text-green-500';
    }
    
    if (label === 'ARRITMIAS') {
      if (value === 'NORMAL') return 'text-green-500';
      if (value === 'LEVE') return 'text-yellow-500';
      if (value === 'MODERADA') return 'text-orange-500';
      if (value === 'SEVERA') return 'text-red-500';
      return 'text-gray-400';
    }
    
    return 'text-gray-400';
  };

  const getTrendIndicator = () => {
    if (trend === 'rising') {
      return <ArrowUp className="h-4 w-4 text-green-500" />;
    }
    if (trend === 'falling') {
      return <ArrowDown className="h-4 w-4 text-red-500" />;
    }
    if (trend === 'rising_rapidly') {
      return <ArrowUp className="h-4 w-4 text-red-500" />;
    }
    if (trend === 'falling_rapidly') {
      return <ArrowDown className="h-4 w-4 text-red-500" />;
    }
    return <ArrowRight className="h-4 w-4 text-gray-400" />;
  };

  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-gray-800/50 p-2">
      <span className="text-sm font-medium text-gray-300">{label}</span>
      <div className="flex items-center">
        <span className={cn("text-2xl font-bold", getColorClass())}>
          {value}
        </span>
        {unit && <span className="ml-1 text-sm text-gray-400">{unit}</span>}
        {trend && getTrendIndicator()}
      </div>
      {secondaryValue && secondaryUnit && (
        <span className="text-xs text-gray-400">
          {secondaryValue} {secondaryUnit}
        </span>
      )}
      {temperatureLocation && (
        <div className="flex items-center mt-1">
          <Thermometer className="h-3 w-3 mr-1 text-gray-400" />
          <span className="text-xs text-gray-400">
            {temperatureLocation}
          </span>
        </div>
      )}
      {cholesterolData && (
        <div className="flex flex-col items-center mt-1">
          <span className="text-xs text-gray-400">
            HDL: {cholesterolData.hdl} mg/dL
          </span>
          <span className="text-xs text-gray-400">
            LDL: {cholesterolData.ldl} mg/dL
          </span>
          <span className="text-xs text-gray-400">
            Triglicéridos: {cholesterolData.triglycerides} mg/dL
          </span>
        </div>
      )}
      {isFinalReading && (
        <span className="mt-1 text-xs text-green-500">
          Lectura final
        </span>
      )}
    </div>
  );
};

export default VitalSign;
