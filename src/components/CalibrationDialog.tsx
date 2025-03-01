import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";

interface CalibrationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCalibrationStart: () => void;
  onCalibrationEnd: () => void;
}

// Constantes para animación - Reducidas para mejorar rendimiento
const ANIMATION_CONFIG = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: "easeOut" }
};

const CalibrationDialog: React.FC<CalibrationDialogProps> = React.memo(({ 
  isOpen, 
  onClose,
  onCalibrationStart,
  onCalibrationEnd
}) => {
  const [systolic, setSystolic] = React.useState<string>("");
  const [diastolic, setDiastolic] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!isOpen) {
      setSystolic("");
      setDiastolic("");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleCalibration = React.useCallback(async () => {
    try {
      setIsSubmitting(true);
      onCalibrationStart();

      // Simulamos un pequeño delay para la calibración
      await new Promise(resolve => setTimeout(resolve, 500)); // Reducido de 1000ms a 500ms

      onCalibrationEnd();
      setTimeout(() => {
        onClose();
      }, 300); // Reducido de 500ms a 300ms

    } catch (error) {
      console.error("Error durante la calibración:", error);
      onCalibrationEnd();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }, [onCalibrationStart, onCalibrationEnd, onClose]);

  const handleClose = React.useCallback(() => {
    if (!isSubmitting) {
      onClose();
    }
  }, [isSubmitting, onClose]);

  const isFormValid = React.useMemo(() => 
    Boolean(systolic && diastolic && !isSubmitting), 
    [systolic, diastolic, isSubmitting]
  );

  // Optimizar el manejo de cambios en los inputs
  const handleSystolicChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Solo permitir números y limitar a 3 dígitos
    if (/^\d{0,3}$/.test(value)) {
      setSystolic(value);
    }
  }, []);

  const handleDiastolicChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Solo permitir números y limitar a 3 dígitos
    if (/^\d{0,3}$/.test(value)) {
      setDiastolic(value);
    }
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md perspective-1000">
        <motion.div
          {...ANIMATION_CONFIG}
          className="bg-background p-6 rounded-lg shadow-lg hardware-accelerated"
        >
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              disabled={isSubmitting}
              className="hardware-accelerated"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold text-optimized">Calibración</h2>
            <div className="w-9" />
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-optimized">Sistólica</label>
              <Input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="120"
                value={systolic}
                onChange={handleSystolicChange}
                className="w-full hardware-accelerated"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-optimized">Diastólica</label>
              <Input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="80"
                value={diastolic}
                onChange={handleDiastolicChange}
                className="w-full hardware-accelerated"
                disabled={isSubmitting}
              />
            </div>

            <Button
              className="w-full hardware-accelerated"
              onClick={handleCalibration}
              disabled={!isFormValid}
            >
              {isSubmitting ? "Calibrando..." : "Calibrar"}
            </Button>

            <p className="text-xs text-gray-500 text-center text-optimized">
              Ingrese los valores de su última medición
            </p>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
});

CalibrationDialog.displayName = "CalibrationDialog";

export default CalibrationDialog;
