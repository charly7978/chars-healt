import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Info } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tooltip } from "@/components/ui/tooltip";

interface CalibrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCalibrationStart: () => void;
  onCalibrationEnd: () => void;
}

const CalibrationDialog: React.FC<CalibrationDialogProps> = ({ 
  isOpen, 
  onClose,
  onCalibrationStart,
  onCalibrationEnd
}) => {
  const [systolic, setSystolic] = React.useState<string>("120");
  const [diastolic, setDiastolic] = React.useState<string>("80");
  const [perfusionIndex, setPerfusionIndex] = React.useState<number>(0.5);
  const [qualityThreshold, setQualityThreshold] = React.useState<number>(0.65);
  const [calibrationStep, setCalibrationStep] = React.useState<number>(1);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [calibrationProgress, setCalibrationProgress] = React.useState<number>(0);
  const [calibrationMessage, setCalibrationMessage] = React.useState<string>("");

  React.useEffect(() => {
    if (!isOpen) {
      resetCalibrationState();
    }
  }, [isOpen]);

  const resetCalibrationState = () => {
    setCalibrationStep(1);
    setCalibrationProgress(0);
    setCalibrationMessage("");
  };

  const handleNextStep = () => {
    setCalibrationStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setCalibrationStep(prev => Math.max(1, prev - 1));
  };

  const handleCalibration = async () => {
    try {
      setIsSubmitting(true);
      onCalibrationStart();
      setCalibrationMessage("Inicializando sensores...");

      // Simulamos el proceso de calibración por etapas
      await simulateCalibrationProcess();

      onCalibrationEnd();
      setTimeout(() => {
        onClose();
      }, 500);

    } catch (error) {
      console.error("Error durante la calibración:", error);
      setCalibrationMessage("Error en la calibración. Por favor, inténtelo de nuevo.");
      onCalibrationEnd();
    } finally {
      setIsSubmitting(false);
    }
  };

  const simulateCalibrationProcess = async () => {
    // Etapa 1: Inicialización
    setCalibrationProgress(10);
    setCalibrationMessage("Inicializando sensores...");
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Etapa 2: Ajuste de parámetros
    setCalibrationProgress(30);
    setCalibrationMessage("Ajustando sensibilidad...");
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Etapa 3: Calibración de presión
    setCalibrationProgress(50);
    setCalibrationMessage("Calibrando presión arterial...");
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Etapa 4: Calibración PPG
    setCalibrationProgress(70);
    setCalibrationMessage("Calibrando sensores PPG...");
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Etapa 5: Verificación
    setCalibrationProgress(90);
    setCalibrationMessage("Verificando calibración...");
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Calibración completa
    setCalibrationProgress(100);
    setCalibrationMessage("Calibración completa");
    
    // Guardar la configuración en localStorage o base de datos
    const calibrationSettings = {
      systolic: parseInt(systolic),
      diastolic: parseInt(diastolic),
      perfusionIndex,
      qualityThreshold,
      lastCalibration: new Date().toISOString()
    };
    
    localStorage.setItem('calibrationSettings', JSON.stringify(calibrationSettings));
    
    return new Promise(resolve => setTimeout(resolve, 500));
  };

  const renderStepContent = () => {
    switch (calibrationStep) {
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 mb-4">
              Ingrese los valores de su última medición de presión arterial para una calibración más precisa.
            </p>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Presión Sistólica</label>
              <Input
                type="number"
                placeholder="120"
                value={systolic}
                onChange={(e) => setSystolic(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Presión Diastólica</label>
              <Input
                type="number"
                placeholder="80"
                value={diastolic}
                onChange={(e) => setDiastolic(e.target.value)}
                className="w-full"
              />
            </div>
            
            <Button
              className="w-full"
              onClick={handleNextStep}
              disabled={!systolic || !diastolic}
            >
              Siguiente
            </Button>
          </div>
        );
      
      case 2:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 mb-4">
              Ajuste los parámetros avanzados para optimizar la detección del pulso.
            </p>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Índice de Perfusión</label>
                <span className="text-xs text-gray-500">{perfusionIndex.toFixed(2)}</span>
              </div>
              <Slider 
                value={[perfusionIndex]} 
                min={0.1} 
                max={1.0} 
                step={0.05}
                onValueChange={(values) => setPerfusionIndex(values[0])} 
              />
              <p className="text-xs text-gray-500">Ajusta la sensibilidad a la detección de flujo sanguíneo</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Umbral de Calidad</label>
                <span className="text-xs text-gray-500">{qualityThreshold.toFixed(2)}</span>
              </div>
              <Slider 
                value={[qualityThreshold]} 
                min={0.4} 
                max={0.9} 
                step={0.05}
                onValueChange={(values) => setQualityThreshold(values[0])} 
              />
              <p className="text-xs text-gray-500">Define la calidad mínima para considerar válidas las lecturas</p>
            </div>
            
            <div className="flex space-x-2">
              <Button
                variant="outline"
                className="w-1/2"
                onClick={handlePrevStep}
              >
                Atrás
              </Button>
              <Button
                className="w-1/2"
                onClick={handleCalibration}
              >
                Calibrar
              </Button>
            </div>
          </div>
        );
      
      case 3:
        return (
          <div className="space-y-4">
            <div className="flex flex-col items-center space-y-6 py-4">
              <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full transition-all duration-500 ease-out"
                  style={{ width: `${calibrationProgress}%` }}
                />
              </div>
              
              <div className="text-center">
                <p className="text-sm font-medium">{calibrationMessage}</p>
                <p className="text-xs text-gray-500 mt-1">Por favor, espere mientras se completa la calibración...</p>
              </div>
              
              {calibrationProgress === 100 && (
                <div className="text-center text-green-600">
                  <p className="font-medium">¡Calibración exitosa!</p>
                  <p className="text-xs mt-1">La aplicación está lista para mediciones precisas</p>
                </div>
              )}
            </div>
            
            {calibrationProgress === 100 && (
              <Button
                className="w-full"
                onClick={onClose}
              >
                Finalizar
              </Button>
            )}
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {
      if (!isSubmitting) {
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-md perspective-1000">
        <motion.div
          initial={{ rotateY: -90 }}
          animate={{ rotateY: 0 }}
          exit={{ rotateY: 90 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ transformStyle: "preserve-3d" }}
          className="bg-background p-6 rounded-lg shadow-lg"
        >
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (!isSubmitting && calibrationStep !== 3) {
                  onClose();
                }
              }}
              disabled={isSubmitting || calibrationStep === 3}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold">Calibración del Monitor</h2>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0"
            >
              <Info className="h-5 w-5" />
            </Button>
          </div>

          {renderStepContent()}
          
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default CalibrationDialog;
