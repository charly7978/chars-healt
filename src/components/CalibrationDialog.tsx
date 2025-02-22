
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CalibrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isCalibrating: boolean;
}

const DEFAULT_CALIBRATION = {
  redThresholdMin: 30,
  redThresholdMax: 250,
  stabilityThreshold: 5.0,
  qualityThreshold: 0.7,
  perfusionIndex: 0.05,
};

const CALIBRATION_STEPS = [
  { id: 1, name: "Sensores de luz", description: "Ajustando sensibilidad lumínica..." },
  { id: 2, name: "Filtros de señal", description: "Optimizando filtros digitales..." },
  { id: 3, name: "Parámetros vitales", description: "Configurando umbrales..." },
];

const CalibrationDialog = ({
  isOpen,
  onClose,
  isCalibrating,
}: CalibrationDialogProps) => {
  const { toast } = useToast();
  const [isFlipping, setIsFlipping] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [calibrationComplete, setCalibrationComplete] = useState(false);

  useEffect(() => {
    if (isCalibrating) {
      setIsFlipping(true);
      setCurrentStep(0);
      setCalibrationComplete(false);

      // Simulamos los pasos de calibración
      const stepInterval = 2000; // 2 segundos por paso
      CALIBRATION_STEPS.forEach((_, index) => {
        setTimeout(() => {
          setCurrentStep(index + 1);
        }, stepInterval * (index + 1));
      });

      // Completamos la calibración después de 6 segundos
      setTimeout(() => {
        setCalibrationComplete(true);
        setIsFlipping(false);
      }, 6000);
    } else {
      setIsFlipping(false);
      setCurrentStep(0);
      setCalibrationComplete(false);
    }
  }, [isCalibrating]);

  const handleResetToDefault = () => {
    // Aquí implementaríamos la lógica para resetear a la configuración por defecto
    toast({
      title: "Configuración Restaurada",
      description: "Se han restaurado los parámetros por defecto",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md duration-500 p-0 overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="relative w-full h-[500px] [perspective:1200px]">
          <div 
            className={`
              relative w-full h-full 
              [transform-style:preserve-3d] 
              transition-transform duration-1000
              ${isFlipping ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]'}
            `}
          >
            {/* Panel Frontal */}
            <div 
              className="absolute inset-0 w-full h-full [backface-visibility:hidden] bg-gradient-to-br from-gray-900 to-gray-800 p-6 flex items-center justify-center"
            >
              <div className="text-2xl font-bold text-white">
                Iniciando Calibración
              </div>
            </div>
            
            {/* Panel Trasero */}
            <div 
              className="absolute inset-0 w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-gray-900 to-gray-800 p-6"
            >
              <div className="h-full flex flex-col">
                <div className="flex-1 space-y-4">
                  {/* Cabecera del Sistema */}
                  <div className="flex justify-between items-start">
                    <h3 className="text-medical-blue font-mono text-sm">Sistema de Calibración v2.0</h3>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      <span className="text-green-500 text-xs font-mono">ACTIVO</span>
                    </div>
                  </div>

                  {/* Visualización de pasos */}
                  <div className="mt-4 space-y-6">
                    {CALIBRATION_STEPS.map((step, index) => (
                      <div key={step.id} className="space-y-2">
                        <div className="flex justify-between items-center text-xs font-mono text-gray-400">
                          <span>{step.name}</span>
                          <span className={currentStep >= step.id ? "text-medical-blue animate-pulse" : ""}>
                            {currentStep >= step.id ? step.description : "Pendiente..."}
                          </span>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-1000 rounded-full
                              ${currentStep >= step.id ? "bg-medical-blue animate-[progress_2s_ease-in-out_infinite]" : "w-0"}
                            `}
                          />
                        </div>
                      </div>
                    ))}

                    {/* Matriz de LEDs simulada */}
                    <div className="grid grid-cols-8 gap-1">
                      {[...Array(32)].map((_, i) => (
                        <div 
                          key={i}
                          className="aspect-square rounded-full bg-medical-blue/30 animate-pulse"
                          style={{ animationDelay: `${Math.random() * 2}s` }}
                        ></div>
                      ))}
                    </div>

                    {/* Terminal de retroalimentación */}
                    <div className="bg-black/50 p-3 rounded-lg font-mono text-xs space-y-1">
                      <p className="text-green-500">{'>'}  Calibración en progreso...</p>
                      {currentStep >= 1 && (
                        <p className="text-medical-blue">{'>'}  Ajustando sensores...</p>
                      )}
                      {currentStep >= 2 && (
                        <p className="text-medical-blue">{'>'}  Optimizando filtros...</p>
                      )}
                      {currentStep >= 3 && (
                        <p className="text-medical-blue">{'>'}  Configuración completada</p>
                      )}
                      <div className="inline-block animate-pulse">_</div>
                    </div>
                  </div>
                </div>

                {calibrationComplete ? (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center gap-4">
                      <CheckCircle2 className="h-12 w-12 text-green-500 animate-scale-in" />
                      <p className="text-white text-center">Calibración completada con éxito</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleResetToDefault}
                        size="sm" 
                        variant="outline"
                        className="flex-1"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Restaurar Default
                      </Button>
                      <Button 
                        onClick={onClose}
                        size="sm"
                        className="flex-1 bg-medical-blue hover:bg-medical-blue/90"
                      >
                        Volver al Monitor
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-sm text-gray-400">
                    Por favor, espere mientras se completa la calibración...
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
