
/**
 * Service for device context information like battery status, ambient light, etc.
 */
class DeviceContextService {
  private _isBatterySavingMode: boolean = false;
  private _ambientLight: 'low' | 'medium' | 'high' = 'medium';
  private _batteryLevel: number = 100;
  private _isCharging: boolean = false;
  private _isBackgrounded: boolean = false;
  private _isDeviceIdle: boolean = false;
  private _lastUserInteractionTime: number = Date.now();
  private _idleCheckInterval: number | null = null;
  private readonly IDLE_TIMEOUT_MS: number = 30000; // 30 seconds of inactivity

  constructor() {
    this.initBatteryMonitoring();
    this.initAmbientLightDetection();
    this.initDeviceStateMonitoring();
  }

  private initBatteryMonitoring() {
    try {
      if ('getBattery' in navigator) {
        // Use the modern Battery API
        (navigator as any).getBattery?.().then((battery: any) => {
          if (battery) {
            this._batteryLevel = battery.level * 100;
            this._isCharging = battery.charging;
            this._isBatterySavingMode = battery.level < 0.2 && !battery.charging;
            
            // Set up event listeners
            battery.addEventListener('levelchange', () => {
              this._batteryLevel = battery.level * 100;
              this._isBatterySavingMode = battery.level < 0.2 && !battery.charging;
            });
            
            battery.addEventListener('chargingchange', () => {
              this._isCharging = battery.charging;
              this._isBatterySavingMode = battery.level < 0.2 && !battery.charging;
            });
          }
        }).catch((err: any) => {
          console.warn('Battery API error:', err);
        });
      }
      
      // Check if device has power saving mode enabled (only works on some platforms)
      if ('powerSaveMode' in navigator) {
        this._isBatterySavingMode = (navigator as any).powerSaveMode;
      }
    } catch (error) {
      console.warn('Battery monitoring initialization error:', error);
    }
  }

  private initAmbientLightDetection() {
    try {
      // Try to use the AmbientLightSensor API if available
      if (typeof window !== 'undefined' && 'AmbientLightSensor' in window) {
        try {
          const sensor = new (window as any).AmbientLightSensor();
          sensor.addEventListener('reading', () => {
            const lux = sensor.illuminance;
            if (lux < 50) {
              this._ambientLight = 'low';
            } else if (lux < 1000) {
              this._ambientLight = 'medium';
            } else {
              this._ambientLight = 'high';
            }
          });
          sensor.start();
        } catch (error) {
          console.warn('AmbientLightSensor error:', error);
          this._ambientLight = 'medium'; // Default to medium
        }
      } else {
        // Fallback: use time of day as a simple heuristic for ambient light
        const hour = new Date().getHours();
        if (hour < 6 || hour > 20) {
          this._ambientLight = 'low';
        } else if (hour < 8 || hour > 18) {
          this._ambientLight = 'medium';
        } else {
          this._ambientLight = 'high';
        }
      }
    } catch (error) {
      console.warn('Ambient light detection initialization error:', error);
      this._ambientLight = 'medium'; // Default to medium
    }
  }

  private initDeviceStateMonitoring() {
    // Check visibility change
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this._isBackgrounded = document.hidden;
      });

      // Monitor user interaction to detect idle state
      const resetIdleTimer = () => {
        this._lastUserInteractionTime = Date.now();
        this._isDeviceIdle = false;
      };

      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
      events.forEach(name => {
        document.addEventListener(name, resetIdleTimer, { passive: true });
      });

      // Setup idle check interval
      this._idleCheckInterval = window.setInterval(() => {
        const now = Date.now();
        if (now - this._lastUserInteractionTime > this.IDLE_TIMEOUT_MS) {
          this._isDeviceIdle = true;
        }
      }, 10000); // Check every 10 seconds
    }
  }

  /**
   * Process ambient light from image data
   * Analyzes image data to estimate ambient light conditions
   */
  public processAmbientLight(imageData: ImageData): void {
    try {
      const data = imageData.data;
      let totalLuminance = 0;
      
      // Sample pixels to estimate overall brightness
      const totalPixels = imageData.width * imageData.height;
      const samplingRate = Math.max(1, Math.floor(totalPixels / 10000)); // Sample at most 10,000 pixels
      let sampledPixels = 0;
      
      for (let i = 0; i < data.length; i += 4 * samplingRate) {
        // Calculate luminance using standard formula: 0.299R + 0.587G + 0.114B
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuminance += luminance;
        sampledPixels++;
      }
      
      const avgLuminance = totalLuminance / sampledPixels;
      
      // Categorize ambient light based on average luminance
      if (avgLuminance < 40) {
        this._ambientLight = 'low';
      } else if (avgLuminance < 120) {
        this._ambientLight = 'medium';
      } else {
        this._ambientLight = 'high';
      }
    } catch (error) {
      console.warn('Error processing ambient light:', error);
    }
  }
  
  // Public getters
  get isBatterySavingMode(): boolean {
    return this._isBatterySavingMode;
  }
  
  get ambientLight(): 'low' | 'medium' | 'high' {
    return this._ambientLight;
  }
  
  get batteryLevel(): number {
    return this._batteryLevel;
  }
  
  get isCharging(): boolean {
    return this._isCharging;
  }

  get isBackgrounded(): boolean {
    return this._isBackgrounded;
  }

  get isDeviceIdle(): boolean {
    return this._isDeviceIdle;
  }

  // Cleanup method (important for memory management)
  public dispose(): void {
    if (this._idleCheckInterval !== null) {
      clearInterval(this._idleCheckInterval);
      this._idleCheckInterval = null;
    }
  }
}

// Create a singleton instance
const deviceContextService = new DeviceContextService();
export default deviceContextService;
