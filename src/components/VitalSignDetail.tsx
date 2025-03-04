
/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
import React from 'react';
import { Thermometer, Droplet } from 'lucide-react';

interface VitalSignDetailProps {
  title: string;
  value: string | number;
  unit?: string;
  riskLevel?: string;
  type: "heartRate" | "spo2" | "bloodPressure" | "arrhythmia" | "respiration" | "glucose" | "hemoglobin" | "cholesterol" | "temperature";
  onBack: () => void;
  secondaryValue?: string | number;
  secondaryUnit?: string;
  trend?: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  cholesterolData?: {
    hdl: number;
    ldl: number;
    triglycerides: number;
  };
  temperatureLocation?: 'forehead' | 'wrist' | 'finger';
}

/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
const VitalSignDetail: React.FC<VitalSignDetailProps> = ({
  title,
  value,
  unit,
  riskLevel,
  type,
  onBack,
  secondaryValue,
  secondaryUnit,
  trend,
  cholesterolData,
  temperatureLocation
}) => {
  const renderCholesterolDetails = () => {
    if (type !== 'cholesterol' || !cholesterolData) return null;
    
    return (
      <div className="mt-4 p-3 bg-black/10 rounded-lg">
        <h3 className="font-semibold mb-2 text-center">Componentes detallados</h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="text-center">
            <div className="font-bold">{cholesterolData.hdl}</div>
            <div className="text-xs opacity-75">HDL (mg/dL)</div>
          </div>
          <div className="text-center">
            <div className="font-bold">{cholesterolData.ldl}</div>
            <div className="text-xs opacity-75">LDL (mg/dL)</div>
          </div>
          <div className="text-center">
            <div className="font-bold">{cholesterolData.triglycerides}</div>
            <div className="text-xs opacity-75">Triglicéridos (mg/dL)</div>
          </div>
        </div>
        
        <div className="mt-3 text-xs">
          <div className="flex justify-between">
            <span>HDL (bueno):</span>
            <span>{getHDLStatus(cholesterolData.hdl)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>LDL (malo):</span>
            <span>{getLDLStatus(cholesterolData.ldl)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Triglicéridos:</span>
            <span>{getTriglyceridStatus(cholesterolData.triglycerides)}</span>
          </div>
        </div>
      </div>
    );
  };
  
  const renderTemperatureDetails = () => {
    if (type !== 'temperature') return null;
    
    return (
      <div className="mt-4 p-3 bg-black/10 rounded-lg">
        <div className="flex justify-center mb-2">
          <Thermometer className="w-6 h-6" />
        </div>
        
        <div className="text-center mb-2">
          <span className="text-xs opacity-75">Medido en: </span>
          <span className="font-semibold">
            {temperatureLocation === 'finger' ? 'DEDO' : 
             temperatureLocation === 'wrist' ? 'MUÑECA' : 'FRENTE'}
          </span>
        </div>
        
        <div className="text-center">
          <span className="text-xs opacity-75">Tendencia: </span>
          <span className="font-semibold">
            {trend === 'rising' ? '↗ SUBIENDO' : 
             trend === 'falling' ? '↘ BAJANDO' : 'ESTABLE'}
          </span>
        </div>
      </div>
    );
  };
  
  const getHDLStatus = (value: number): string => {
    if (value < 40) return "BAJO";
    if (value < 60) return "NORMAL";
    return "ÓPTIMO";
  };
  
  const getLDLStatus = (value: number): string => {
    if (value < 100) return "ÓPTIMO";
    if (value < 130) return "NORMAL";
    if (value < 160) return "LÍMITE ALTO";
    if (value < 190) return "ELEVADO";
    return "MUY ELEVADO";
  };
  
  const getTriglyceridStatus = (value: number): string => {
    if (value < 150) return "NORMAL";
    if (value < 200) return "LÍMITE ALTO";
    if (value < 500) return "ELEVADO";
    return "MUY ELEVADO";
  };
  
  return (
    <div className="vital-sign-detail">
      <h2>{title}</h2>
      <p>{value} {unit}</p>
      {secondaryValue !== undefined && (
        <p>{secondaryValue} {secondaryUnit}</p>
      )}
      {riskLevel && <p>Risk Level: {riskLevel}</p>}
      {trend && type === 'glucose' && <p>Trend: {trend}</p>}
      
      {renderCholesterolDetails()}
      {renderTemperatureDetails()}
      
      <button onClick={onBack}>Back</button>
    </div>
  );
};

/**
 * ESTA APPS ES DE MEDICION ULTRA REAL - PROHIBIDA CUALQUIER SIMULACION - NO ESTA PERMITIDO HACER MOVIMIENTOS POR CUENTA DE LA I.A SIN AUTORIZACION DEL USUARIO
 */
export default VitalSignDetail;
