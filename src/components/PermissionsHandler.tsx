import React, { useEffect, useState, useCallback } from 'react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Define types for dynamically imported Capacitor plugins
interface CameraPermissionState {
  camera: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
}

interface CameraPlugin {
  checkPermissions(): Promise<CameraPermissionState>;
  requestPermissions(options: { permissions: string[] }): Promise<CameraPermissionState>;
}

interface AppPlugin {
  exitApp(): Promise<void>;
  openUrl(options: { url: string }): Promise<{ completed: boolean }>;
}

interface PermissionsHandlerProps {
  onPermissionsGranted: () => void;
  onPermissionsDenied: () => void;
}

// Helper functions to check if we're in a Capacitor environment
const isCapacitorAvailable = (): boolean => {
  return typeof (window as any).Capacitor !== 'undefined';
};

const isNativePlatform = (): boolean => {
  return isCapacitorAvailable() && (window as any).Capacitor.isNativePlatform();
};

const PermissionsHandler: React.FC<PermissionsHandlerProps> = ({ 
  onPermissionsGranted, 
  onPermissionsDenied 
}) => {
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  // Detect platform
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(/android/i.test(userAgent));
  }, []);

  // Handle web browser camera permissions
  const checkWebPermissions = useCallback(async () => {
    try {
      console.log('Checking web camera permissions');
      // Request camera permission using standard web API
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Stop the stream right away, we just needed to check permissions
      stream.getTracks().forEach(track => track.stop());
      
      console.log('Web camera permission granted');
      onPermissionsGranted();
    } catch (error) {
      console.error('Web camera permission denied:', error);
      setShowPermissionDialog(true);
      onPermissionsDenied();
    }
  }, [onPermissionsGranted, onPermissionsDenied]);

  // Handle Capacitor native permissions
  const checkCapacitorPermissions = useCallback(async () => {
    try {
      console.log('Checking Capacitor camera permissions');
      
      // Dynamically import Capacitor plugins to avoid issues in web environment
      // Using type assertion to handle the dynamic import
      const cameraModule = await import('@capacitor/camera').catch(() => null);
      
      if (!cameraModule) {
        console.error('Failed to import @capacitor/camera, falling back to web permissions');
        return checkWebPermissions();
      }
      
      const Camera = cameraModule.Camera as CameraPlugin;
      
      // Check current permission status
      const cameraPermission = await Camera.checkPermissions();
      
      if (cameraPermission.camera === 'granted') {
        console.log('Capacitor camera permission already granted');
        onPermissionsGranted();
      } else {
        console.log('Requesting Capacitor camera permission...');
        const requestResult = await Camera.requestPermissions({
          permissions: ['camera']
        });
        
        if (requestResult.camera === 'granted') {
          console.log('Capacitor camera permission granted');
          onPermissionsGranted();
        } else {
          console.log('Capacitor camera permission denied');
          setShowPermissionDialog(true);
          onPermissionsDenied();
        }
      }
    } catch (error) {
      console.error('Error checking Capacitor permissions:', error);
      
      // Fallback to web permissions if Capacitor permissions fail
      try {
        await checkWebPermissions();
      } catch (fallbackError) {
        console.error('Both Capacitor and web permissions failed:', fallbackError);
        setShowPermissionDialog(true);
        onPermissionsDenied();
      }
    }
  }, [checkWebPermissions, onPermissionsGranted, onPermissionsDenied]);

  // Main permissions check function
  const checkAndRequestPermissions = useCallback(async () => {
    try {
      if (isNativePlatform()) {
        await checkCapacitorPermissions();
      } else {
        await checkWebPermissions();
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      setShowPermissionDialog(true);
      onPermissionsDenied();
    } finally {
      setPermissionsChecked(true);
    }
  }, [checkCapacitorPermissions, checkWebPermissions, onPermissionsDenied]);

  // Function to open app settings
  const openAppSettings = async () => {
    try {
      if (isNativePlatform()) {
        const appModule = await import('@capacitor/app').catch(() => null);
        
        if (!appModule) {
          console.error('Failed to import @capacitor/app');
          alert('Please manually open your device settings and allow camera access for this app');
          return;
        }
        
        const App = appModule.App as AppPlugin;
        
        if (isAndroid) {
          // On Android, we can try to launch settings
          try {
            // Try to open app settings
            await App.openUrl({ url: 'package:' + (window as any).Capacitor.getPlatform() });
          } catch (e) {
            // Fallback to just exiting the app so user can manually change settings
            console.log('Could not open settings directly, exiting app instead');
            await App.exitApp();
          }
        } else {
          // On iOS, we don't have a direct way, so just inform user
          alert('Please open Settings app and allow camera access for this app');
        }
      } else {
        // In web, we can just ask the user to check browser settings
        alert('Please allow camera access in your browser settings');
      }
    } catch (error) {
      console.error('Error opening settings:', error);
      alert('Please manually open your device settings and allow camera access for this app');
    }
  };

  // Run permission check on component mount
  useEffect(() => {
    checkAndRequestPermissions();
  }, [checkAndRequestPermissions]);

  return (
    <Dialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Camera Permission Required</DialogTitle>
          <DialogDescription>
            This app needs access to your camera to measure vital signs. Please grant camera permission to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col space-y-3">
          <p className="text-sm text-gray-500">
            Without camera permission, the app cannot function properly. Your privacy is important - camera data is only processed on your device and is not stored or transmitted.
          </p>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button onClick={openAppSettings}>
            Open Settings
          </Button>
          <Button variant="outline" onClick={() => {
            setShowPermissionDialog(false);
            // Try checking permissions again
            checkAndRequestPermissions();
          }}>
            Try Again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PermissionsHandler;
