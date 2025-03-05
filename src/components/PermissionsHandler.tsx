
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
import { toast } from '@/components/ui/use-toast';

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
  const [permissionErrors, setPermissionErrors] = useState<string | null>(null);

  const checkAndRequestPermissions = async () => {
    try {
      console.log('Checking camera permissions...');
      
      if (!Capacitor.isNativePlatform()) {
        // For web browsers, try getUserMedia directly
        try {
          console.log('Web browser detected, checking camera via getUserMedia');
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          // If we got here, permission is granted - stop the stream
          stream.getTracks().forEach(track => track.stop());
          console.log('Camera permission granted via getUserMedia');
          onPermissionsGranted();
          return;
        } catch (webError) {
          console.error('Error getting web camera permission:', webError);
          // If getUserMedia fails, show the dialog
          setPermissionErrors(`Web camera error: ${webError instanceof Error ? webError.message : String(webError)}`);
          setShowPermissionDialog(true);
          onPermissionsDenied();
          return;
        }
      }

      // Capacitor native platform flow
      console.log('Checking Capacitor camera permissions');
      const cameraPermission = await Camera.checkPermissions();
      
      if (cameraPermission.camera === 'granted') {
        console.log('Permiso de cámara ya concedido');
        onPermissionsGranted();
        toast({
          title: "Permiso concedido",
          description: "Permiso de cámara otorgado correctamente.",
        });
      } else {
        console.log('Solicitando permiso de cámara...');
        const requestResult = await Camera.requestPermissions({
          permissions: ['camera']
        });
        
        if (requestResult.camera === 'granted') {
          console.log('Permiso de cámara concedido');
          onPermissionsGranted();
          toast({
            title: "Permiso concedido",
            description: "Permiso de cámara otorgado correctamente.",
          });
        } else {
          console.log('Permiso de cámara denegado');
          setShowPermissionDialog(true);
          onPermissionsDenied();
          toast({
            variant: "destructive",
            title: "Permiso denegado",
            description: "La app necesita acceso a la cámara para funcionar.",
          });
        }
      }
    } catch (error) {
      console.error('Error al verificar permisos:', error);
      setPermissionErrors(`Error: ${error instanceof Error ? error.message : String(error)}`);
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
    } else {
      // For web, just reload the page to re-trigger permission prompt
      window.location.reload();
    }
  };

  useEffect(() => {
    const permissionTimeout = setTimeout(() => {
      checkAndRequestPermissions();
    }, 500); // Slight delay to ensure app is fully loaded
    
    return () => clearTimeout(permissionTimeout);
  }, []);

  return (
    <>
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
            {permissionErrors && (
              <p className="text-xs text-red-500 font-mono">
                Error: {permissionErrors}
              </p>
            )}
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
            <Button onClick={openAppSettings}>
              Abrir configuración
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reintentar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Debug button for permission issues */}
      {!permissionsChecked && (
        <div className="absolute top-2 right-2 z-[1000]">
          <Button size="sm" variant="outline" onClick={checkAndRequestPermissions}>
            Verificar permisos
          </Button>
        </div>
      )}
    </>
  );
};

export default PermissionsHandler;
