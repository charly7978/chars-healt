
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Settings2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CalibrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isCalibrating: boolean;
}

const CalibrationDialog = ({
  isOpen,
  onClose,
  isCalibrating,
}: CalibrationDialogProps) => {
  const { toast } = useToast();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md animate-in slide-in-from-bottom-10 duration-500">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold text-medical-blue">
            {isCalibrating ? "Calibración en Proceso" : "Calibración Completada"}
          </DialogTitle>
          <DialogDescription className="text-center space-y-4">
            {isCalibrating ? (
              <div className="flex flex-col items-center gap-6 py-8">
                <div className="relative">
                  <Loader2 className="h-12 w-12 animate-spin text-medical-blue" />
                  <Settings2 className="h-6 w-6 text-medical-blue absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                </div>
                <div className="space-y-4 animate-fade-in">
                  <p className="text-lg font-medium text-gray-700">
                    Ajustando parámetros del sistema...
                  </p>
                  <div className="space-y-2 text-sm text-gray-500">
                    <p className="animate-fade-in [animation-delay:200ms]">
                      • Calibrando sensores de luz
                    </p>
                    <p className="animate-fade-in [animation-delay:400ms]">
                      • Optimizando detección de pulso
                    </p>
                    <p className="animate-fade-in [animation-delay:600ms]">
                      • Ajustando filtros de señal
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 mt-4 animate-pulse">
                    Por favor, mantenga su dedo firme sobre la cámara
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-8 animate-fade-in">
                <CheckCircle2 className="h-12 w-12 text-green-500 animate-scale-in" />
                <div className="space-y-2">
                  <p className="text-lg font-medium text-gray-700">
                    ¡Calibración Exitosa!
                  </p>
                  <p className="text-sm text-gray-500">
                    Los parámetros han sido optimizados para esta sesión
                  </p>
                </div>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        {!isCalibrating && (
          <div className="flex justify-center">
            <Button 
              onClick={onClose} 
              variant="outline"
              className="animate-fade-in [animation-delay:300ms]"
            >
              Volver al Monitor
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CalibrationDialog;
