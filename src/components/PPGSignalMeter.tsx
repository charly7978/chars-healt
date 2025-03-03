import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Heart, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PPGSignalMeterProps {
  value: number;
  quality: number;
  isFingerDetected: boolean;
  onStartMeasurement: () => void;
  onReset: () => void;
  arrhythmiaStatus?: string;
  rawArrhythmiaData?: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
  isCalibrating?: boolean;
  calibrationStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
}

// Configuración para el renderizado de la forma de onda
const CANVAS_HEIGHT = 120;
const CANVAS_PADDING = 10;
const SIGNAL_COLOR = '#4ade80'; // verde esmeralda
const GRID_COLOR = 'rgba(87, 87, 87, 0.2)';
const BACKGROUND_COLOR = '#18181b'; // zinc-900
const GRID_SIZE = 20;
const MAX_POINTS = 150;

const PPGSignalMeter: React.FC<PPGSignalMeterProps> = ({
  value,
  quality,
  isFingerDetected,
  onStartMeasurement,
  onReset,
  arrhythmiaStatus,
  rawArrhythmiaData,
  isCalibrating = false,
  calibrationStatus = 'pending'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataPointsRef = useRef<number[]>([]);
  const animationRef = useRef<number>(0);
  const [pulseAnimation, setPulseAnimation] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [lastValue, setLastValue] = useState(0);
  
  const [calibrationSettings, setCalibrationSettings] = useState<{
    perfusionIndex: number;
    qualityThreshold: number;
    lastCalibration: string | null;
  } | null>(null);

  // Efecto para cargar las configuraciones de calibración
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('calibrationSettings');
      if (savedSettings) {
        setCalibrationSettings(JSON.parse(savedSettings));
      }
    } catch (error) {
      console.error('Error al cargar configuración de calibración:', error);
    }
  }, [calibrationStatus]);

  // Efecto para la animación de pulso y progreso de calibración
  useEffect(() => {
    // Detectar cambios significativos para animar el pulso
    if (value > lastValue * 1.05 && value > 0.4) {
      setPulseAnimation(true);
      setTimeout(() => setPulseAnimation(false), 150);
    }
    setLastValue(value);
    
    // Manejar progreso de calibración
    if (isCalibrating && calibrationStatus === 'in_progress') {
      const interval = setInterval(() => {
        setCalibrationProgress(prev => {
          if (prev >= 99) {
            clearInterval(interval);
            return 100;
          }
          return prev + 1;
        });
      }, 80);
      
      return () => clearInterval(interval);
    } else if (calibrationStatus === 'completed') {
      setCalibrationProgress(100);
    } else if (calibrationStatus !== 'in_progress') {
      setCalibrationProgress(0);
    }
  }, [value, isCalibrating, calibrationStatus, lastValue]);

  // Actualizar los puntos de datos con el nuevo valor
  useEffect(() => {
    if (isFingerDetected) {
      dataPointsRef.current.push(value);
      if (dataPointsRef.current.length > MAX_POINTS) {
        dataPointsRef.current.shift();
      }
    }
  }, [value, isFingerDetected]);

  // Dibujar la cuadrícula de fondo
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;

    // Líneas horizontales
    for (let y = CANVAS_PADDING; y < height - CANVAS_PADDING; y += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Líneas verticales
    for (let x = GRID_SIZE; x < width; x += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Línea base (centro)
    const baselineY = height / 2;
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(width, baselineY);
    ctx.stroke();
  }, []);

  // Dibujar la forma de onda
  const drawWaveform = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const dataPoints = dataPointsRef.current;
    if (dataPoints.length < 2) return;

    const baseline = height / 2;
    const maxAmplitude = height * 0.4;
    
    // Calcular el paso para que los puntos ocupen todo el ancho del canvas
    const step = width / MAX_POINTS;

    // Establecer el estilo para la forma de onda
    ctx.strokeStyle = SIGNAL_COLOR;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    // Aplicar suavizado a la señal para una visualización más profesional
    ctx.shadowColor = 'rgba(74, 222, 128, 0.6)';
    ctx.shadowBlur = 5;
    
    // Dibujar la línea que conecta los puntos
    ctx.beginPath();
    
    // Para hacer la onda más suave, usamos bezierCurveTo
    for (let i = 0; i < dataPoints.length; i++) {
      const x = i * step;
      
      // Usamos el valor para modular la altura de la onda
      // Invertimos y escalamos según la amplitud
      const normalizedValue = (dataPoints[i] - 0.5) * 2; // Normalizar entre -1 y 1
      const y = baseline - normalizedValue * maxAmplitude;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else if (i % 3 === 0 || i === dataPoints.length - 1) {
        // Hacemos curvas cada 3 puntos para suavizar y reducir carga
        const prevX = (i - 1) * step;
        const prevY = baseline - (dataPoints[i-1] - 0.5) * 2 * maxAmplitude;
        
        const cpx1 = (prevX + x) / 2;
        const cpy1 = prevY;
        const cpx2 = (prevX + x) / 2;
        const cpy2 = y;
        
        ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, x, y);
      }
    }
    
    ctx.stroke();
    
    // Quitar el shadow blur después de dibujar la forma de onda
    ctx.shadowBlur = 0;
  }, []);

  // Función principal para renderizar el canvas
  const renderSignal = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Obtener dimensiones con pixel ratio para mejor resolución
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Configurar tamaño del canvas con corrección para pixel ratio
    canvas.width = rect.width * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    
    // Escalar el contexto
    ctx.scale(dpr, dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    
    // Limpiar el canvas
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar la cuadrícula
    drawGrid(ctx, rect.width, CANVAS_HEIGHT);
    
    // Dibujar la forma de onda
    if (isFingerDetected) {
      drawWaveform(ctx, rect.width, CANVAS_HEIGHT);
    }
    
    // Requestar el siguiente frame para animación suave
    animationRef.current = requestAnimationFrame(renderSignal);
  }, [drawGrid, drawWaveform, isFingerDetected]);

  // Iniciar y limpiar el loop de animación
  useEffect(() => {
    renderSignal();
    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [renderSignal]);

  // Color para la calidad de la señal
  const getQualityColor = () => {
    if (quality < 0.4) return 'bg-red-500';
    if (quality < 0.7) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  // Ancho para la barra de calidad
  const getQualityWidth = () => {
    return `${Math.max(5, Math.min(100, quality * 100))}%`;
  };

  // Mostrar el estado de detección
  const renderDetectionStatus = () => {
    if (isCalibrating) {
      return (
        <div className="text-xs font-medium mt-2">
          <div className="flex items-center gap-2">
            <div className="w-full bg-gray-800 h-1.5 rounded-full">
              <div 
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${calibrationProgress}%` }}
              />
            </div>
            <span className="w-10 text-right text-blue-400">{calibrationProgress}%</span>
          </div>
          <div className="text-center mt-1 text-blue-400">
            {calibrationStatus === 'pending' && 'Listo para calibrar'}
            {calibrationStatus === 'in_progress' && 'Calibrando...'}
            {calibrationStatus === 'completed' && 'Calibración completada'}
            {calibrationStatus === 'failed' && 'Error de calibración'}
          </div>
        </div>
      );
    }
    
    if (!isFingerDetected) {
      return (
        <div className="text-red-500 text-xs font-medium mt-2 flex items-center justify-center">
          <Zap className="h-3.5 w-3.5 mr-1" />
          Coloque su dedo en la cámara
        </div>
      );
    }

    if (quality < 0.4) {
      return (
        <div className="text-red-500 text-xs font-medium mt-2 flex items-center justify-center">
          <Zap className="h-3.5 w-3.5 mr-1" />
          Señal débil - Ajuste su dedo
        </div>
      );
    }

    if (quality < 0.7) {
      return (
        <div className="text-yellow-500 text-xs font-medium mt-2 flex items-center justify-center">
          <Zap className="h-3.5 w-3.5 mr-1" />
          Señal aceptable - Mantenga estable
        </div>
      );
    }

    return (
      <div className="text-emerald-500 text-xs font-medium mt-2 flex items-center justify-center">
        <Zap className="h-3.5 w-3.5 mr-1" />
        Buena señal - No mueva su dedo
      </div>
    );
  };

  // Información de calibración
  const renderCalibrationInfo = () => {
    if (!calibrationSettings) return null;
    
    const lastCalibrationDate = calibrationSettings.lastCalibration 
      ? new Date(calibrationSettings.lastCalibration).toLocaleString()
      : 'Nunca';
    
    return (
      <div className="text-xs text-gray-400 mt-2 px-2">
        <div className="grid grid-cols-2 gap-1">
          <div>Índice Perfusión:</div>
          <div className="text-right">{calibrationSettings.perfusionIndex.toFixed(2)}</div>
          
          <div>Umbral Calidad:</div>
          <div className="text-right">{calibrationSettings.qualityThreshold.toFixed(2)}</div>
          
          <div>Última Calibración:</div>
          <div className="text-right">{lastCalibrationDate}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 shadow-lg overflow-hidden">
      {/* Cabecera */}
      <div className="flex items-center justify-between bg-zinc-800 px-3 py-2">
        <div className="flex items-center">
          <AnimatePresence>
            {pulseAnimation && (
              <motion.div
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: 1.5, opacity: 0 }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute z-0"
              >
                <Heart className="h-5 w-5 text-red-500" />
              </motion.div>
            )}
          </AnimatePresence>
          <Heart className={`h-5 w-5 ${pulseAnimation ? 'text-red-500' : 'text-gray-400'}`} />
          <span className="ml-2 text-sm font-medium text-gray-200">ECG Monitor</span>
        </div>
        
        {arrhythmiaStatus && arrhythmiaStatus !== "--" && (
          <div className="flex items-center text-yellow-500 text-xs">
            <Activity className="h-4 w-4 mr-1" />
            {arrhythmiaStatus}
          </div>
        )}
      </div>

      {/* Canvas para la forma de onda */}
      <div className="relative w-full">
        <canvas 
          ref={canvasRef} 
          className="w-full" 
          style={{ height: `${CANVAS_HEIGHT}px` }}
        />
        
        {/* Indicador de estado */}
        <div className="absolute top-2 right-2 flex items-center">
          <div className={`w-2.5 h-2.5 rounded-full ${isFingerDetected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
        </div>
      </div>

      {/* Información de calidad de señal */}
      <div className="p-3">
        <div className="w-full bg-zinc-800 h-2 rounded-full">
          <div 
            className={`${getQualityColor()} h-2 rounded-full transition-all duration-300`}
            style={{ width: getQualityWidth() }}
          />
        </div>
        
        {renderDetectionStatus()}
        {!isCalibrating && quality > 0.7 && renderCalibrationInfo()}
        
        {/* Botones de acción */}
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={onReset}
            className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded text-gray-300 transition-colors"
          >
            Reiniciar
          </button>
          
          <button
            onClick={onStartMeasurement}
            disabled={!isFingerDetected || quality < 0.4}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              !isFingerDetected || quality < 0.4
                ? 'bg-zinc-800 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isFingerDetected && quality >= 0.4 ? 'Comenzar Medición' : 'Esperando señal...'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PPGSignalMeter;
