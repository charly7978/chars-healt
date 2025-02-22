
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
      <DialogContent className="sm:max-w-md animate-in slide-in-from-bottom-10 duration-500 p-0 overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800">
        {isCalibrating ? (
          <div className="relative w-full h-[500px] [perspective:1000px]">
            <div 
              className="absolute inset-0 [transform-style:preserve-3d] animate-flip-in"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden'
              }}
            >
              {/* Panel frontal (se voltea) */}
              <div 
                className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-800 p-6 flex items-center justify-center"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden'
                }}
              >
                <div className="text-2xl font-bold text-white">
                  Iniciando Calibración
                </div>
              </div>
              
              {/* Panel trasero (interface técnica) */}
              <div 
                className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-800 p-6"
                style={{
                  transform: 'rotateY(180deg)',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden'
                }}
              >
                <div className="h-full flex flex-col">
                  {/* Pantalla de diagnóstico */}
                  <div className="flex-1 space-y-4">
                    <div className="flex justify-between items-start">
                      <h3 className="text-medical-blue font-mono text-sm">Sistema de Calibración v2.0</h3>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-green-500 text-xs font-mono">ACTIVO</span>
                      </div>
                    </div>

                    {/* Visualización técnica */}
                    <div className="mt-4 space-y-6">
                      {/* Sección de sensores */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs font-mono text-gray-400">
                          <span>SENSORES DE LUZ</span>
                          <span className="text-medical-blue animate-pulse">CALIBRANDO...</span>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-medical-blue animate-[progress_2s_ease-in-out_infinite] rounded-full"></div>
                        </div>
                      </div>

                      {/* Sección de filtros */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs font-mono text-gray-400">
                          <span>FILTROS DE SEÑAL</span>
                          <span className="text-medical-blue animate-pulse">OPTIMIZANDO...</span>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {[...Array(5)].map((_, i) => (
                            <div 
                              key={i} 
                              className="h-8 bg-gray-700 rounded animate-[equalize_1.5s_ease-in-out_infinite]"
                              style={{ animationDelay: `${i * 0.2}s` }}
                            ></div>
                          ))}
                        </div>
                      </div>

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

                      {/* Terminal de diagnóstico */}
                      <div className="bg-black/50 p-3 rounded-lg font-mono text-xs space-y-1">
                        <p className="text-green-500">{'>'}  Iniciando diagnóstico...</p>
                        <p className="text-medical-blue animate-fade-in [animation-delay:500ms]">{'>'}  Verificando sensores...</p>
                        <p className="text-medical-blue animate-fade-in [animation-delay:1000ms]">{'>'}  Ajustando parámetros...</p>
                        <p className="text-medical-blue animate-fade-in [animation-delay:1500ms]">{'>'}  Optimizando señal...</p>
                        <div className="inline-block animate-pulse">_</div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center text-sm text-gray-400 mt-4">
                    Mantenga su dedo firme sobre el sensor
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4 animate-fade-in">
            <div className="flex flex-col items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-500 animate-scale-in" />
              <div className="space-y-2 text-center">
                <p className="text-xl font-medium text-white">
                  ¡Calibración Exitosa!
                </p>
                <p className="text-sm text-gray-400">
                  Todos los sistemas han sido optimizados para esta sesión
                </p>
              </div>
            </div>
            <div className="flex justify-center mt-4">
              <Button 
                onClick={onClose} 
                variant="outline"
                className="animate-fade-in [animation-delay:300ms] text-white hover:text-white hover:bg-medical-blue/20 border-medical-blue"
              >
                Volver al Monitor
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CalibrationDialog;
