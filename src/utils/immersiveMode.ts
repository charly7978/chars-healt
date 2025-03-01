/**
 * Utilidad para gestionar el modo inmersivo en la aplicación para navegadores web
 */
export const ImmersiveMode = {
  /**
   * Inicializa el modo inmersivo
   */
  async initialize(): Promise<void> {
    try {
      // Aplicar configuraciones iniciales
      this.configureViewport();
      
      // Intentar entrar en modo pantalla completa al iniciar
      await this.enableImmersiveMode();
      
      // Agregar listener para reactivar modo inmersivo cuando el usuario vuelve a la app
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.enableImmersiveMode();
        }
      });
      
      // Agregar listener para cuando el usuario sale de pantalla completa
      document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
          document.body.classList.remove('immersive-mode');
        } else {
          document.body.classList.add('immersive-mode');
        }
      });
    } catch (error) {
      console.error('Error al inicializar el modo inmersivo:', error);
    }
  },
  
  /**
   * Configura el viewport para evitar zoom y mejorar la experiencia táctil
   */
  configureViewport(): void {
    // Prevenir el zoom en dispositivos móviles
    const metaViewport = document.querySelector('meta[name=viewport]');
    if (metaViewport) {
      metaViewport.setAttribute('content', 
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    } else {
      // Si no existe, crear el meta tag
      const meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
      document.head.appendChild(meta);
    }
    
    // Aplicar estilos adicionales para modo inmersivo
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'manipulation';
    
    // Configurar variables CSS para safe areas
    this.setupSafeAreas();
  },
  
  /**
   * Configura variables CSS para safe areas en dispositivos con notch
   */
  setupSafeAreas(): void {
    // Agregar variables CSS para manejo de safe-areas en iOS/Android
    const style = document.createElement('style');
    style.innerHTML = `
      :root {
        --sat: env(safe-area-inset-top, 0px);
        --sar: env(safe-area-inset-right, 0px);
        --sab: env(safe-area-inset-bottom, 0px);
        --sal: env(safe-area-inset-left, 0px);
      }
      
      body {
        padding-top: var(--sat);
        padding-right: var(--sar);
        padding-bottom: var(--sab);
        padding-left: var(--sal);
      }
    `;
    document.head.appendChild(style);
  },
  
  /**
   * Activa el modo inmersivo (pantalla completa)
   */
  async enableImmersiveMode(): Promise<void> {
    try {
      const elem = document.documentElement;
      
      // Intentar bloquear la orientación a vertical si está disponible
      if (screen.orientation?.lock) {
        try {
          await screen.orientation.lock('portrait');
        } catch (e) {
          console.warn('No se pudo bloquear la orientación:', e);
        }
      }
      
      // Intentar activar el modo pantalla completa
      if (!document.fullscreenElement) {
        const requestFullscreen = elem.requestFullscreen || 
                               (elem as any).webkitRequestFullscreen ||
                               (elem as any).mozRequestFullScreen ||
                               (elem as any).msRequestFullscreen;
                            
        if (requestFullscreen) {
          try {
            await requestFullscreen.call(elem);
            document.body.classList.add('immersive-mode');
          } catch (err) {
            console.warn('Error al solicitar pantalla completa:', err);
          }
        }
      }
    } catch (error) {
      console.error('Error al activar el modo inmersivo:', error);
    }
  },
  
  /**
   * Desactiva el modo inmersivo
   */
  async disableImmersiveMode(): Promise<void> {
    try {
      // Salir del modo pantalla completa
      if (document.fullscreenElement) {
        const exitFullscreen = document.exitFullscreen || 
                            (document as any).webkitExitFullscreen ||
                            (document as any).mozCancelFullScreen ||
                            (document as any).msExitFullscreen;
                          
        if (exitFullscreen) {
          await exitFullscreen.call(document);
        }
      }
      
      // Desbloquear orientación si está disponible
      if (screen.orientation?.unlock) {
        screen.orientation.unlock();
      }
      
      // Quitar clase del body
      document.body.classList.remove('immersive-mode');
    } catch (error) {
      console.error('Error al desactivar el modo inmersivo:', error);
    }
  }
};

export default ImmersiveMode; 