
import React from 'react';

interface VitalSignDetailProps {
  title: string;
  value: string | number;
  unit?: string;
  riskLevel?: string;
  type: 'heartRate' | 'spo2' | 'bloodPressure' | 'arrhythmia' | 'respiration' | 'glucose' | 'lipids';
  onBack: () => void;
  secondaryValue?: string | number;
  secondaryUnit?: string;
  trend?: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
}

const VitalSignDetail: React.FC<VitalSignDetailProps> = ({
  title,
  value,
  unit,
  riskLevel,
  type,
  onBack,
  secondaryValue,
  secondaryUnit,
  trend
}) => {
  const getDescription = () => {
    switch (type) {
      case 'heartRate':
        return "La frecuencia cardíaca es el número de veces que su corazón late por minuto. Un ritmo cardíaco normal en reposo para adultos oscila entre 60 y 100 latidos por minuto.";
      case 'spo2':
        return "La saturación de oxígeno en sangre (SpO2) es una medida de cuánto oxígeno transporta su sangre en relación con su capacidad máxima. Niveles normales son 95% o superiores.";
      case 'bloodPressure':
        return "La presión arterial es la fuerza que ejerce la sangre contra las paredes de las arterias. Se expresa como presión sistólica (cuando el corazón late) sobre presión diastólica (cuando el corazón descansa).";
      case 'arrhythmia':
        return "Las arritmias son alteraciones del ritmo cardíaco. Pueden manifestarse como latidos demasiado rápidos, demasiado lentos o irregulares.";
      case 'respiration':
        return "La frecuencia respiratoria es el número de respiraciones que realiza por minuto. La profundidad indica la cantidad de aire inhalado y exhalado.";
      case 'glucose':
        return "El nivel de glucosa en sangre indica la cantidad de azúcar presente en su torrente sanguíneo. Los niveles normales en ayunas están entre 70 y 100 mg/dL.";
      case 'lipids':
        return "El perfil lipídico incluye colesterol total, HDL ('bueno'), LDL ('malo') y triglicéridos. Estos valores son importantes para evaluar el riesgo cardiovascular.";
      default:
        return "";
    }
  };

  const getRecommendations = () => {
    switch (type) {
      case 'heartRate':
        if (typeof value === 'number') {
          if (value < 60) return "Consulte a su médico si experimenta mareos o fatiga con esta frecuencia cardíaca baja.";
          if (value > 100) return "Considere reducir la cafeína y el estrés. Consulte a un médico si persiste en reposo.";
          return "Su frecuencia cardíaca está dentro del rango normal.";
        }
        return "";
      case 'spo2':
        if (typeof value === 'number') {
          if (value < 90) return "Busque atención médica inmediata. Niveles por debajo del 90% son preocupantes.";
          if (value < 95) return "Considere consultar a un médico, especialmente si tiene problemas respiratorios.";
          return "Su nivel de oxígeno está dentro del rango normal.";
        }
        return "";
      case 'bloodPressure':
        if (typeof value === 'string') {
          const [systolic, diastolic] = value.split('/').map(Number);
          if (systolic > 130 || diastolic > 80) return "Considere limitar la sal, hacer ejercicio regularmente y reducir el estrés.";
          if (systolic < 90 || diastolic < 60) return "Si experimenta mareos o debilidad, consulte a un médico.";
          return "Su presión arterial está dentro del rango normal.";
        }
        return "";
      case 'glucose':
        if (typeof value === 'number') {
          if (value < 70) return "Considere consumir algo con azúcar rápidamente. Niveles bajos pueden ser peligrosos.";
          if (value > 126) return "Considere consultar a un médico para evaluar riesgo de diabetes.";
          return "Su nivel de glucosa está dentro del rango normal.";
        }
        return "";
      case 'lipids':
        if (typeof value === 'number') {
          if (value > 200) return "Considere reducir grasas saturadas y trans, aumentar fibra y hacer ejercicio regularmente.";
          return "Su nivel de colesterol total está dentro del rango deseable.";
        }
        return "";
      default:
        return "";
    }
  };

  const getTrendIcon = () => {
    if (!trend || trend === 'unknown' || trend === 'stable') return null;
    
    let icon = '';
    let color = '';
    
    switch (trend) {
      case 'rising':
        icon = '↗';
        color = '#F97316';
        break;
      case 'falling':
        icon = '↘';
        color = '#3B82F6';
        break;
      case 'rising_rapidly':
        icon = '⇑';
        color = '#DC2626';
        break;
      case 'falling_rapidly':
        icon = '⇓';
        color = '#DC2626';
        break;
    }
    
    return (
      <span className="text-2xl font-bold ml-1" style={{ color }}>
        {icon}
      </span>
    );
  };

  const renderLipidDetails = () => {
    if (type !== 'lipids' || typeof value !== 'number') return null;
    
    return (
      <div className="mt-4 bg-gray-800 rounded-lg p-4">
        <h4 className="text-white text-lg font-medium mb-2">Perfil Lipídico Detallado</h4>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-300">Colesterol Total:</span>
            <span className="text-white font-medium">{value} mg/dL</span>
          </div>
          {typeof secondaryValue === 'string' && secondaryValue.includes('HDL') && (
            <div className="flex justify-between">
              <span className="text-gray-300">HDL (Bueno):</span>
              <span className="text-white font-medium">{secondaryValue.replace('HDL: ', '')} mg/dL</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-300">LDL (Malo):</span>
            <span className="text-white font-medium">~{Math.round(typeof value === 'number' ? value * 0.6 : 0)} mg/dL</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-300">Triglicéridos:</span>
            <span className="text-white font-medium">~{Math.round(typeof value === 'number' ? value * 0.8 : 0)} mg/dL</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <button 
          onClick={onBack}
          className="p-2 rounded-full text-white hover:bg-gray-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2 className="text-white text-xl font-bold">{title}</h2>
        <div className="w-10"></div>
      </div>
      
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col items-center mb-6 mt-4">
          <div className="flex items-baseline">
            <span className="text-4xl font-bold text-white">{value}</span>
            {getTrendIcon()}
            {unit && <span className="text-lg text-gray-400 ml-1">{unit}</span>}
          </div>
          
          {secondaryValue && (
            <div className="mt-2 flex items-baseline">
              <span className="text-lg text-gray-300">{secondaryValue}</span>
              {secondaryUnit && <span className="text-sm text-gray-400 ml-1">{secondaryUnit}</span>}
            </div>
          )}
          
          {riskLevel && (
            <div className="mt-2 px-3 py-1 rounded-full bg-opacity-20" style={{ backgroundColor: riskLevel ? `${riskLevel}20` : undefined }}>
              <span className="text-sm font-medium" style={{ color: riskLevel }}>{riskLevel}</span>
            </div>
          )}
        </div>
        
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-white text-lg font-medium mb-2">Información</h3>
            <p className="text-gray-300">{getDescription()}</p>
          </div>
          
          {renderLipidDetails()}
          
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-white text-lg font-medium mb-2">Recomendaciones</h3>
            <p className="text-gray-300">{getRecommendations()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VitalSignDetail;
