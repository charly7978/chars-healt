import React, { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';

interface RespiratoryMonitorProps {
  respirationRate: number;
  confidence: number;
  breathingPattern?: string;
  estimatedDepth?: number;
  isFinalReading?: boolean;
  className?: string;
}

/**
 * Componente para mostrar la frecuencia respiratoria
 */
const RespiratoryMonitor: React.FC<RespiratoryMonitorProps> = ({
  respirationRate,
  confidence,
  breathingPattern = 'desconocido',
  estimatedDepth = 0,
  isFinalReading = false,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const lastBreathPhaseRef = useRef<number>(0);
  
  // Determinar color según frecuencia respiratoria
  const getRespRateColor = (rate: number): string => {
    if (rate === 0) return 'text-gray-400';
    if (rate < 12) return 'text-yellow-500'; // Respiración lenta
    if (rate > 20) return 'text-red-500';    // Respiración rápida
    return 'text-green-500';                 // Respiración normal
  };
  
  // Determinar mensaje según patrón de respiración
  const getBreathingMessage = (pattern: string): string => {
    switch (pattern) {
      case 'normal':
        return 'Respiración normal';
      case 'rápida':
        return 'Respiración rápida';
      case 'lenta':
        return 'Respiración lenta';
      case 'irregular':
        return 'Respiración irregular';
      default:
        return 'Analizando respiración...';
    }
  };
  
  // Animar la visualización de respiración
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let lastTimestamp = 0;
    let breathPhase = lastBreathPhaseRef.current;
    
    // Calcular duración del ciclo respiratorio en milisegundos
    const breathCycleDuration = respirationRate > 0 ? 
      60000 / Math.max(8, respirationRate) : 
      5000; // Valor por defecto para animación inicial
    
    const animate = (timestamp: number) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const elapsed = timestamp - lastTimestamp;
      
      // Actualizar fase de respiración (0-1)
      breathPhase = (breathPhase + (elapsed / breathCycleDuration)) % 1;
      lastBreathPhaseRef.current = breathPhase;
      
      // Limpiar canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Dibujar onda respiratoria
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;
      
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      
      // Dibujar curva sinusoidal para simular respiración
      for (let x = 0; x < width; x++) {
        // Calcular posición en la onda respiratoria
        const normalizedX = x / width;
        // Añadir fase actual para crear animación
        const y = centerY - Math.sin((normalizedX * Math.PI * 2) + (breathPhase * Math.PI * 2)) * (height * 0.4 * Math.max(0.2, estimatedDepth));
        ctx.lineTo(x, y);
      }
      
      // Configurar estilo de línea según confianza
      const alphaOpacity = 0.3 + (confidence * 0.7);
      ctx.strokeStyle = `rgba(37, 99, 235, ${alphaOpacity})`;
      ctx.lineWidth = 2 + (confidence * 2);
      ctx.stroke();
      
      // Continuar animación si componente sigue montado
      lastTimestamp = timestamp;
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    // Iniciar animación
    animationFrameRef.current = requestAnimationFrame(animate);
    
    // Limpiar al desmontar
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [respirationRate, estimatedDepth, confidence]);
  
  // Calidad visual según confianza
  const qualityClasses = confidence < 0.3 
    ? 'opacity-50' 
    : confidence < 0.7 
      ? 'opacity-85' 
      : 'opacity-100';

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 transition-all",
      qualityClasses,
      className
    )}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Frecuencia Respiratoria
        </h3>
        
        <div className="flex items-center">
          {confidence > 0.4 && (
            <span className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium mr-2",
              breathingPattern === 'normal' ? 'bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-400' :
              breathingPattern === 'rápida' ? 'bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-400' :
              breathingPattern === 'lenta' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-400' :
              breathingPattern === 'irregular' ? 'bg-purple-100 text-purple-800 dark:bg-purple-800/20 dark:text-purple-400' :
              'bg-gray-100 text-gray-800 dark:bg-gray-800/20 dark:text-gray-400'
            )}>
              {getBreathingMessage(breathingPattern)}
            </span>
          )}
          
          {isFinalReading && (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-800/20 dark:text-blue-400">
              Lectura Final
            </span>
          )}
        </div>
      </div>
      
      <div className="mt-2 flex items-end justify-between">
        <div className="flex items-baseline">
          <span className={cn(
            "text-3xl font-extrabold",
            getRespRateColor(respirationRate)
          )}>
            {respirationRate > 0 ? Math.round(respirationRate) : '--'}
          </span>
          <span className="ml-1 text-sm font-medium text-gray-500 dark:text-gray-400">
            resp/min
          </span>
        </div>
        
        {/* Indicador de profundidad */}
        {estimatedDepth > 0 && (
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-500 dark:text-gray-400">Profundidad</span>
            <div className="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 dark:bg-blue-600 rounded-full"
                style={{ width: `${Math.min(100, estimatedDepth * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Visualización de onda respiratoria */}
      <div className="mt-3 w-full h-12 overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-900/50">
        <canvas 
          ref={canvasRef}
          width={200}
          height={48}
          className="w-full h-full"
        />
      </div>
      
      {/* Indicador de confianza */}
      <div className="mt-2 flex justify-between items-center">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {confidence < 0.3 ? 'Calibrando...' : 
           confidence < 0.7 ? 'Estabilizando...' : 
           'Medición estable'}
        </span>
        <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full",
              confidence < 0.3 ? 'bg-red-500' :
              confidence < 0.7 ? 'bg-yellow-500' :
              'bg-green-500'
            )}
            style={{ width: `${Math.min(100, confidence * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default RespiratoryMonitor; 