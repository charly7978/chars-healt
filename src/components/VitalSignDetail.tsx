
import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

interface VitalSignDetailProps {
  title: string;
  value: string | number;
  unit?: string;
  riskLevel?: string;
  type: 'heartRate' | 'spo2' | 'bloodPressure' | 'arrhythmia';
  onBack: () => void;
}

const VitalSignDetail: React.FC<VitalSignDetailProps> = ({
  title,
  value,
  unit,
  riskLevel,
  type,
  onBack
}) => {
  const [info, setInfo] = useState<{
    description: string;
    interpretation: string;
    recommendation: string;
  }>({
    description: '',
    interpretation: '',
    recommendation: ''
  });

  useEffect(() => {
    // Get relevant information based on the vital sign type and value
    setInfo(getVitalSignInfo(type, value, riskLevel));
  }, [type, value, riskLevel]);

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col animate-fade-in z-50">
      <div className="flex items-center p-4 border-b border-gray-800">
        <button 
          onClick={onBack}
          className="mr-4 p-2 rounded-full hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      
      <div className="flex-1 overflow-auto p-4">
        <div className="mb-6 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <div className="text-4xl font-bold mb-2">
              {value}
              {unit && <span className="text-xl ml-1">{unit}</span>}
            </div>
            {riskLevel && (
              <div 
                className={`text-sm font-medium px-3 py-1 rounded-full ${getRiskBadgeColor(riskLevel)}`}
              >
                {riskLevel}
              </div>
            )}
          </div>
        </div>
        
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-blue-400">¿Qué significa?</h2>
          <p className="mb-4 text-gray-300 leading-relaxed">{info.description}</p>
        </section>
        
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-blue-400">Interpretación de su resultado</h2>
          <p className="mb-4 text-gray-300 leading-relaxed">{info.interpretation}</p>
        </section>
        
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-blue-400">Recomendación</h2>
          <p className="mb-4 text-gray-300 leading-relaxed">{info.recommendation}</p>
        </section>
      </div>
    </div>
  );
};

const getRiskBadgeColor = (riskLevel: string): string => {
  switch (riskLevel?.toUpperCase()) {
    case 'NORMAL':
    case 'ÓPTIMO':
    case 'RIESGO MÍNIMO':
      return 'bg-green-900 text-green-100';
    case 'ELEVADO':
    case 'RIESGO BAJO':
      return 'bg-yellow-800 text-yellow-100';
    case 'RIESGO MODERADO':
      return 'bg-orange-800 text-orange-100';
    case 'ALTO':
    case 'RIESGO ALTO':
      return 'bg-red-800 text-red-100';
    default:
      return 'bg-gray-800 text-gray-100';
  }
};

const getVitalSignInfo = (
  type: 'heartRate' | 'spo2' | 'bloodPressure' | 'arrhythmia',
  value: string | number,
  riskLevel?: string
) => {
  // Default values
  let info = {
    description: '',
    interpretation: '',
    recommendation: ''
  };

  // Heart Rate information
  if (type === 'heartRate') {
    const bpm = typeof value === 'number' ? value : parseInt(value as string, 10);
    
    info.description = 'La frecuencia cardíaca es el número de veces que el corazón late por minuto. Es un indicador importante de la salud cardiovascular y puede verse afectada por factores como el ejercicio, el estrés, la hidratación y medicamentos.';
    
    if (isNaN(bpm) || value === '--') {
      info.interpretation = 'No se pudo obtener una medición válida.';
      info.recommendation = 'Intente una nueva medición asegurándose de posicionar correctamente el dedo sobre la cámara.';
    } else if (bpm < 60) {
      info.interpretation = 'Su frecuencia cardíaca está por debajo del rango normal (60-100 BPM). Esto se conoce como bradicardia y puede ser normal en atletas o durante el sueño.';
      info.recommendation = 'Si experimenta mareos, fatiga o desmayos junto con una frecuencia cardíaca baja, considere consultar a un médico.';
    } else if (bpm >= 60 && bpm <= 100) {
      info.interpretation = 'Su frecuencia cardíaca está dentro del rango normal (60-100 BPM).';
      info.recommendation = 'Continúe manteniendo hábitos saludables como ejercicio regular, buena alimentación y control del estrés.';
    } else {
      info.interpretation = 'Su frecuencia cardíaca está por encima del rango normal (60-100 BPM). Esto se conoce como taquicardia y puede ser normal durante el ejercicio o estrés.';
      info.recommendation = 'Si experimenta palpitaciones, mareos o dolor en el pecho junto con una frecuencia cardíaca elevada en reposo, considere consultar a un médico.';
    }
  }
  
  // SpO2 information
  else if (type === 'spo2') {
    const spo2 = typeof value === 'number' ? value : parseInt(value as string, 10);
    
    info.description = 'La saturación de oxígeno (SpO2) mide el porcentaje de hemoglobina en la sangre que está saturada con oxígeno. Es un indicador importante de la función respiratoria y la eficiencia del intercambio de gases.';
    
    if (isNaN(spo2) || value === '--') {
      info.interpretation = 'No se pudo obtener una medición válida.';
      info.recommendation = 'Intente una nueva medición asegurándose de posicionar correctamente el dedo sobre la cámara.';
    } else if (spo2 >= 95) {
      info.interpretation = 'Su nivel de saturación de oxígeno es normal (95-100%). Esto indica que sus pulmones están funcionando bien.';
      info.recommendation = 'Continúe manteniendo hábitos saludables y evite fumar para mantener una buena función respiratoria.';
    } else if (spo2 >= 90 && spo2 < 95) {
      info.interpretation = 'Su nivel de saturación de oxígeno está ligeramente por debajo de lo normal (90-94%). Puede ser normal en algunas personas con condiciones respiratorias preexistentes.';
      info.recommendation = 'Si este nivel es inusual para usted o si experimenta dificultad para respirar, considere consultar a un médico.';
    } else {
      info.interpretation = 'Su nivel de saturación de oxígeno está por debajo de lo recomendado (<90%). Niveles bajos pueden indicar hipoxemia.';
      info.recommendation = 'Niveles persistentemente bajos de SpO2 requieren atención médica. Consulte a un médico lo antes posible, especialmente si experimenta dificultad para respirar.';
    }
  }
  
  // Blood Pressure information
  else if (type === 'bloodPressure') {
    const bpString = value as string;
    
    info.description = 'La presión arterial es la fuerza que ejerce la sangre contra las paredes de las arterias. Se expresa en dos valores: sistólica (cuando el corazón se contrae) y diastólica (cuando el corazón se relaja).';
    
    if (bpString === '--/--' || bpString === '0/0') {
      info.interpretation = 'No se pudo obtener una medición válida.';
      info.recommendation = 'Intente una nueva medición asegurándose de posicionar correctamente el dedo sobre la cámara.';
    } else {
      const [systolic, diastolic] = bpString.split('/').map(v => parseInt(v, 10));
      
      if (systolic < 120 && diastolic < 80) {
        info.interpretation = 'Su presión arterial es óptima (<120/<80 mmHg).';
        info.recommendation = 'Continúe manteniendo hábitos saludables como dieta balanceada, ejercicio regular y control del estrés.';
      } else if ((systolic >= 120 && systolic < 130) && diastolic < 80) {
        info.interpretation = 'Su presión arterial está elevada (120-129/<80 mmHg). Esto puede ser un precursor de hipertensión.';
        info.recommendation = 'Considere reducir el consumo de sal, aumentar la actividad física y monitorear su presión regularmente.';
      } else if ((systolic >= 130 && systolic < 140) || (diastolic >= 80 && diastolic < 90)) {
        info.interpretation = 'Su presión arterial indica hipertensión estadio 1 (130-139/80-89 mmHg).';
        info.recommendation = 'Consulte a un médico para evaluar su riesgo cardiovascular y considere cambios en el estilo de vida.';
      } else if (systolic >= 140 || diastolic >= 90) {
        info.interpretation = 'Su presión arterial indica hipertensión estadio 2 (≥140/≥90 mmHg).';
        info.recommendation = 'Consulte a un médico lo antes posible. Puede requerir tratamiento médico además de cambios en el estilo de vida.';
      } else if (systolic >= 180 || diastolic >= 120) {
        info.interpretation = 'Su presión arterial indica crisis hipertensiva (>180/>120 mmHg).';
        info.recommendation = 'Busque atención médica inmediata. Este nivel puede ser peligroso y requiere tratamiento urgente.';
      }
    }
  }
  
  // Arrhythmia information
  else if (type === 'arrhythmia') {
    const arrhythmiaStatus = value as string;
    const isArrhythmiaDetected = arrhythmiaStatus.includes('DETECTADA') || !isNaN(parseInt(arrhythmiaStatus as string, 10));
    
    info.description = 'Las arritmias son alteraciones en el ritmo cardíaco normal. Pueden manifestarse como latidos demasiado rápidos, lentos o irregulares. Algunas arritmias son benignas, mientras que otras pueden indicar problemas cardíacos subyacentes.';
    
    if (arrhythmiaStatus === '--') {
      info.interpretation = 'No se pudo evaluar la presencia de arritmias.';
      info.recommendation = 'Intente una nueva medición con buena calidad de señal para permitir la detección de arritmias.';
    } else if (isArrhythmiaDetected) {
      const count = parseInt(arrhythmiaStatus.split('|')[1] || arrhythmiaStatus, 10);
      
      if (count <= 3) {
        info.interpretation = 'Se detectaron arritmias ocasionales. Un pequeño número de latidos irregulares puede ser normal en algunas personas.';
        info.recommendation = 'Monitoree su ritmo cardíaco regularmente. Si experimenta síntomas como palpitaciones, mareos o fatiga, consulte a un médico.';
      } else if (count <= 6) {
        info.interpretation = 'Se detectaron varias arritmias. Esto podría indicar alguna alteración en el ritmo cardíaco que requiere seguimiento.';
        info.recommendation = 'Considere consultar a un médico para una evaluación más detallada, especialmente si experimenta síntomas.';
      } else if (count <= 8) {
        info.interpretation = 'Se detectó un número moderado de arritmias. Este nivel puede indicar una condición de arritmia más significativa.';
        info.recommendation = 'Consulte a un cardiólogo para una evaluación completa. Puede requerir pruebas adicionales como un electrocardiograma o monitor Holter.';
      } else {
        info.interpretation = 'Se detectó un número alto de arritmias. Esto podría indicar una condición de arritmia significativa.';
        info.recommendation = 'Consulte a un cardiólogo lo antes posible para una evaluación completa. Arritmias frecuentes pueden requerir tratamiento médico.';
      }
    } else {
      info.interpretation = 'No se detectaron arritmias significativas durante la medición.';
      info.recommendation = 'Continúe monitoreando su ritmo cardíaco regularmente como parte de su rutina de salud.';
    }
  }

  return info;
};

export default VitalSignDetail;

