import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

/**
 * Utilidad para gestionar el modo inmersivo en la aplicación
 */
export const ImmersiveMode = {
  /**
   * Inicializa el modo inmersivo
   */
  async initialize(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        // Ocultar la barra de estado
        await StatusBar.hide();
        
        // Establecer el estilo de la barra de estado (por si se muestra)
        await StatusBar.setStyle({ style: Style.Dark });
        
        // Establecer el color de fondo de la barra de estado
        await StatusBar.setBackgroundColor({ color: '#000000' });
        
        // Escuchar cuando la aplicación vuelve a primer plano
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            this.enableImmersiveMode();
          }
        });
        
        // Activar el modo inmersivo
        await this.enableImmersiveMode();
      } catch (error) {
        console.error('Error al inicializar el modo inmersivo:', error);
      }
    }
  },
  
  /**
   * Activa el modo inmersivo
   */
  async enableImmersiveMode(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        // Ocultar la barra de estado
        await StatusBar.hide();
        
        // Agregar clase al body para CSS específico
        document.body.classList.add('immersive-mode');
        
        // Prevenir el zoom en dispositivos móviles
        const metaViewport = document.querySelector('meta[name=viewport]');
        if (metaViewport) {
          metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        }
      } catch (error) {
        console.error('Error al activar el modo inmersivo:', error);
      }
    }
  },
  
  /**
   * Desactiva el modo inmersivo
   */
  async disableImmersiveMode(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        // Mostrar la barra de estado
        await StatusBar.show();
        
        // Quitar clase del body
        document.body.classList.remove('immersive-mode');
      } catch (error) {
        console.error('Error al desactivar el modo inmersivo:', error);
      }
    }
  }
};

export default ImmersiveMode; 