import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';

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
  const [permissionState, setPermissionState] = useState<'checking' | 'granted' | 'denied' | 'prompt'>('checking');

  const checkCameraPermission = async () => {
    try {
      // Verificar si la API de navigator.permissions está disponible
      if (navigator.permissions && navigator.permissions.query) {
        // Consultar el estado actual del permiso de cámara
        const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        
        console.log('Estado de permiso de cámara:', permissionStatus.state);
        setPermissionState(permissionStatus.state as 'granted' | 'denied' | 'prompt');
        
        if (permissionStatus.state === 'granted') {
          onPermissionsGranted();
        } else if (permissionStatus.state === 'denied') {
          onPermissionsDenied();
          setShowPermissionDialog(true);
        } else {
          // Si el estado es 'prompt', intentamos solicitar acceso a la cámara
          requestCameraAccess();
        }
        
        // Configurar el listener para cambios en el estado de los permisos
        permissionStatus.addEventListener('change', (e) => {
          const target = e.target as PermissionStatus;
          console.log('Cambio en estado de permiso de cámara:', target.state);
          setPermissionState(target.state as 'granted' | 'denied' | 'prompt');
          
          if (target.state === 'granted') {
            onPermissionsGranted();
            setShowPermissionDialog(false);
          } else if (target.state === 'denied') {
            onPermissionsDenied();
            setShowPermissionDialog(true);
          }
        });
      } else {
        // Si la API de permisos no está disponible, intentamos solicitar directamente
        console.log('API de permisos no disponible, solicitando acceso directamente');
        requestCameraAccess();
      }
    } catch (error) {
      console.error('Error al verificar permisos de cámara:', error);
      // Si hay un error, intentamos solicitar directamente
      requestCameraAccess();
    } finally {
      setPermissionsChecked(true);
    }
  };

  const requestCameraAccess = async () => {
    try {
      console.log('Solicitando acceso a la cámara...');
      // Intentar obtener acceso a la cámara
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Si llegamos aquí, el permiso fue concedido
      console.log('Permiso de cámara concedido');
      setPermissionState('granted');
      onPermissionsGranted();
      
      // Detener inmediatamente todos los tracks para liberar la cámara
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      console.error('Error al solicitar acceso a la cámara:', error);
      setPermissionState('denied');
      onPermissionsDenied();
      setShowPermissionDialog(true);
    }
  };

  const handleRetryPermission = () => {
    requestCameraAccess();
  };

  useEffect(() => {
    // Verificar permisos cuando el componente se monta
    checkCameraPermission();
  }, []);

  return (
    <Dialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <Camera className="w-12 h-12 text-red-500" />
          </div>
          <DialogTitle className="text-center">Permiso de cámara necesario</DialogTitle>
          <DialogDescription className="text-center">
            Esta aplicación necesita acceso a la cámara para medir tus signos vitales. 
            Sin este permiso, la aplicación no podrá funcionar correctamente.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col space-y-3">
          <p className="text-sm text-center text-gray-500">
            Por favor, concede acceso a la cámara cuando tu navegador lo solicite.
          </p>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button onClick={handleRetryPermission} className="w-full">
            Reintentar
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
            Recargar página
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PermissionsHandler;
