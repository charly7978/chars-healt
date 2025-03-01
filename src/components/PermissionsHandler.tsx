
import React, { useEffect, useState } from 'react';
import { Capacitor, Plugins } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { dialog } from '@/components/ui/dialog';
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
          showPermissionDialog();
          onPermissionsDenied();
        }
      }
    } catch (error) {
      console.error('Error al verificar permisos:', error);
      showPermissionDialog();
      onPermissionsDenied();
    } finally {
      setPermissionsChecked(true);
    }
  };

  const showPermissionDialog = () => {
    dialog({
      title: "Permisos necesarios",
      description: "Esta aplicación necesita acceso a la cámara para medir tus signos vitales. Por favor, concede los permisos necesarios en la configuración de tu dispositivo.",
      content: (
        <div className="mt-4 flex flex-col space-y-3">
          <p className="text-sm text-gray-500">
            Sin estos permisos, la aplicación no podrá funcionar correctamente.
          </p>
        </div>
      ),
      buttons: [
        {
          label: "Abrir configuración",
          onClick: openAppSettings
        },
        {
          label: "Entendido",
          variant: "outline"
        }
      ]
    });
  };

  const openAppSettings = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        // @ts-ignore - App no está tipado en @capacitor/core
        const { App } = Plugins;
        if (App && App.openSettings) {
          await App.openSettings();
        }
      } catch (error) {
        console.error('Error al abrir configuración:', error);
      }
    }
  };

  useEffect(() => {
    checkAndRequestPermissions();
  }, []);

  return null; // Este componente no renderiza nada, solo maneja permisos
};

export default PermissionsHandler;
