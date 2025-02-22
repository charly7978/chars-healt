
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, Timer, Settings, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CalibrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isCalibrating: boolean;
}

const CALIBRATION_STEPS = [
  {
    id: 1,
    name: "Sensibilidad Lumínica",
    processes: [
      "Ajustando ganancia del sensor",
      "Optimizando umbral de detección",
      "Calibrando offset dinámico"
    ]
  },
  {
    id: 2,
    name: "Procesamiento Digital",
    processes: [
      "Configurando filtro Kalman",
      "Ajustando ventana de análisis",
      "Optimizando tasa de muestreo"
    ]
  },
  {
    id: 3,
    name: "Algoritmos Vitales",
    processes: [
      "Calibrando detector de picos",
      "Ajustando índice de perfusión",
      "Optimizando métricas PPG"
    ]
  }
];

const CalibrationDialog = ({ isOpen, onClose, isCalibrating }: CalibrationDialogProps) => {
  const { toast } = useToast();
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentProcess, setCurrentProcess] = useState(0);
  const [calibrationComplete, setCalibrationComplete] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isCalibrating) {
      // Iniciamos la animación de volteo
      setIsFlipped(true);
      setCurrentStep(0);
      setCurrentProcess(0);
      setCalibrationComplete(false);
      setProgress(0);

      // Temporizador general de progreso
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 1.67, 100)); // 100% en 6 segundos
      }, 100);

      // Simulación de procesos de calibración
      CALIBRATION_STEPS.forEach((_, stepIndex) => {
        const stepDelay = (stepIndex * 2000); // 2 segundos por paso principal
        
        setTimeout(() => {
          setCurrentStep(stepIndex + 1);
          
          // Subprocesos dentro de cada paso
          CALIBRATION_STEPS[stepIndex].processes.forEach((_, processIndex) => {
            setTimeout(() => {
              setCurrentProcess(processIndex + 1);
            }, processIndex * 500); // 0.5 segundos por subproceso
          });
        }, stepDelay);
      });

      // Finalización de la calibración
      setTimeout(() => {
        setCalibrationComplete(true);
        clearInterval(progressInterval);
        setProgress(100);
      }, 6000);

    } else {
      setIsFlipped(false);
      setCurrentStep(0);
      setCurrentProcess(0);
      setCalibrationComplete(false);
      setProgress(0);
    }
  }, [isCalibrating]);

  const handleResetDefaults = () => {
    toast({
      title: "Configuración Restaurada",
      description: "Se han restablecido los parámetros por defecto"
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800 border-0">
        <div className="relative w-full h-[600px] [perspective:1200px]">
          <div 
            className={`
              relative w-full h-full 
              [transform-style:preserve-3d] 
              transition-transform duration-1000
              ${isFlipped ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]'}
            `}
          >
            {/* Cara Frontal */}
            <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] bg-gradient-to-br from-gray-900 to-gray-800 p-8">
              <div className="h-full flex flex-col items-center justify-center space-y-6">
                <Settings className="w-16 h-16 text-blue-400 animate-spin-slow" />
                <h2 className="text-2xl font-bold text-white">Sistema de Calibración</h2>
                <p className="text-gray-400 text-center">
                  Iniciando secuencia de auto-calibración
                </p>
              </div>
            </div>

            {/* Cara Posterior (Panel Técnico) */}
            <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-gray-900 to-gray-800 p-6">
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xs font-mono text-blue-400">SISTEMA DE CALIBRACIÓN v2.0</h3>
                    <p className="text-xs text-gray-500 mt-1">Secuencia de auto-calibración en progreso</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Timer className="w-4 h-4 text-blue-400 animate-pulse" />
                    <span className="text-xs font-mono text-gray-400">
                      {Math.round(progress)}%
                    </span>
                  </div>
                </div>

                {/* Progress Bar Principal */}
                <div className="w-full h-1 bg-gray-800 rounded-full mb-8">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {/* Pasos de Calibración */}
                <div className="flex-1 space-y-6">
                  {CALIBRATION_STEPS.map((step, index) => (
                    <div 
                      key={step.id}
                      className={`
                        p-4 rounded-lg border transition-all duration-300
                        ${currentStep >= step.id 
                          ? "border-blue-500/50 bg-blue-500/5" 
                          : "border-gray-800 bg-gray-900/50"}
                      `}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`
                          w-2 h-2 rounded-full
                          ${currentStep > step.id 
                            ? "bg-green-500" 
                            : currentStep === step.id 
                              ? "bg-blue-500 animate-pulse" 
                              : "bg-gray-700"}
                        `} />
                        <h4 className="text-sm font-semibold text-gray-300">
                          {step.name}
                        </h4>
                      </div>
                      
                      <div className="space-y-2 pl-5">
                        {step.processes.map((process, pIndex) => (
                          <div 
                            key={pIndex}
                            className={`
                              text-xs font-mono transition-all duration-300
                              ${currentStep > step.id || (currentStep === step.id && currentProcess > pIndex)
                                ? "text-green-400" 
                                : currentStep === step.id && currentProcess === pIndex
                                  ? "text-blue-400 animate-pulse"
                                  : "text-gray-600"}
                            `}
                          >
                            {process}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer con Acciones */}
                {calibrationComplete ? (
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-center gap-3 text-green-500">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm">Calibración Completada</span>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1 border-gray-800 hover:border-gray-700"
                        onClick={handleResetDefaults}
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Restaurar Default
                      </Button>
                      <Button 
                        className="flex-1 bg-blue-500 hover:bg-blue-600"
                        onClick={onClose}
                      >
                        Volver al Monitor
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6">
                    <p className="text-center text-sm text-gray-500">
                      Calibración en progreso, por favor espere...
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CalibrationDialog;
