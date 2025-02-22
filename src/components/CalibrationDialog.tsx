
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Calibración en Proceso</DialogTitle>
          <DialogDescription className="text-center space-y-4">
            {isCalibrating ? (
              <>
                <div className="flex flex-col items-center gap-4 py-6">
                  <Loader2 className="h-8 w-8 animate-spin text-medical-blue" />
                  <p>
                    Por favor, mantenga su dedo firme sobre la cámara.
                    Este proceso tomará unos segundos...
                  </p>
                </div>
              </>
            ) : (
              <p className="py-6">
                Calibración completada exitosamente.
              </p>
            )}
          </DialogDescription>
        </DialogHeader>
        {!isCalibrating && (
          <div className="flex justify-center">
            <Button onClick={onClose} variant="outline">
              Volver al Monitor
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CalibrationDialog;
