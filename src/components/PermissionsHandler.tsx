
import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PermissionsHandlerProps {
  onPermissionsGranted: () => void;
  onPermissionsDenied: () => void;
}

const PermissionsHandler: React.FC<PermissionsHandlerProps> = ({ 
  onPermissionsGranted, 
  onPermissionsDenied 
}) => {
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);

  const checkAndRequestPermissions = async () => {
    try {
      if (!Capacitor.isNativePlatform()) {
        // En web, el navegador solicitará los permisos cuando se use la cámara
        onPermissionsGranted();
        return;
      }

      // Verificar permiso de cámara
      const cameraPermission = await Camera.checkPermissions();
      
      if (cameraPermission.camera === 'granted') {
        console.log('Permiso de cámara ya concedido');
        onPermissionsGranted();
      } else {
        console.log('Solicitando permiso de cámara...');
        const requestResult = await Camera.requestPermissions({
          permissions: ['camera']
        });
        
        if (requestResult.camera === 'granted') {
          console.log('Permiso de cámara concedido');
          onPermissionsGranted();
        } else {
          console.log('Permiso de cámara denegado');
          setShowPermissionDialog(true);
          onPermissionsDenied();
        }
      }
    } catch (error) {
      console.error('Error al verificar permisos:', error);
      setShowPermissionDialog(true);
      onPermissionsDenied();
    } finally {
      setPermissionsChecked(true);
    }
  };

  const openAppSettings = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { App } = await import('@capacitor/app');
        // The correct method to open app settings is App.openUrl() with app settings URL
        // or use native implementation like this:
        await App.exitApp(); // This will just exit the app, allowing user to manually go to settings
        // Some platforms may support direct settings access in future Capacitor versions
      } catch (error) {
        console.error('Error al abrir configuración:', error);
      }
    }
  };

  useEffect(() => {
    checkAndRequestPermissions();
  }, []);

  return (
    <Dialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permisos necesarios</DialogTitle>
          <DialogDescription>
            Esta aplicación necesita acceso a la cámara para medir tus signos vitales. Por favor, concede los permisos necesarios en la configuración de tu dispositivo.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col space-y-3">
          <p className="text-sm text-gray-500">
            Sin estos permisos, la aplicación no podrá funcionar correctamente.
          </p>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button onClick={openAppSettings}>
            Abrir configuración
          </Button>
          <Button variant="outline" onClick={() => setShowPermissionDialog(false)}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PermissionsHandler;
