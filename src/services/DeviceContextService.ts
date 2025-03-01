
/**
 * Service to manage device context information like battery level, ambient light, etc.
 */
class DeviceContextService {
  private _batteryLevel: number = 100;
  private _isBatterySavingMode: boolean = false;
  private _isDeviceIdle: boolean = false;
  private _isBackgrounded: boolean = false;
  private _ambientLight: 'low' | 'medium' | 'high' = 'medium';
  private _lastAmbientLightUpdate: number = 0;
  private _sampleCount: number = 0;
  private _brightnessValues: number[] = [];
  private _maxSamples: number = 10;
  private _sampleRate: number = 2000; // milliseconds

  constructor() {
    this.initBatteryMonitoring();
    this.initVisibilityMonitoring();
    
    // Initialize with default values
    this._ambientLight = 'medium';
    this._brightnessValues = [];
    this._sampleCount = 0;
  }

  /**
   * Initialize battery monitoring if browser supports it
   */
  private initBatteryMonitoring() {
    if ('getBattery' in navigator) {
      // Get initial battery status
      navigator.getBattery().then(battery => {
        this.updateBatteryInfo(battery);

        // Set up event listeners for battery changes
        battery.addEventListener('levelchange', () => this.updateBatteryInfo(battery));
        battery.addEventListener('chargingchange', () => this.updateBatteryInfo(battery));
      }).catch(error => {
        console.error('Error accessing battery info:', error);
      });
    } else {
      console.log('Battery API not supported on this device');
    }
  }

  /**
   * Update battery information
   */
  private updateBatteryInfo(battery: any) {
    try {
      this._batteryLevel = battery.level * 100;
      
      // Consider low battery if level is below 20% and not charging
      this._isBatterySavingMode = battery.level < 0.2 && !battery.charging;
      
      console.log(`DeviceContextService: Battery level: ${this._batteryLevel}%, Saving mode: ${this._isBatterySavingMode}`);
    } catch (error) {
      console.error('Error updating battery info:', error);
    }
  }

  /**
   * Initialize visibility monitoring
   */
  private initVisibilityMonitoring() {
    // Listen for visibility changes
    document.addEventListener('visibilitychange', () => {
      this._isBackgrounded = document.hidden;
      console.log(`DeviceContextService: App ${this._isBackgrounded ? 'backgrounded' : 'foregrounded'}`);
    });

    // Listen for user idle state (no interaction for 60 seconds)
    let idleTimer: number | null = null;
    const resetIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      this._isDeviceIdle = false;
      idleTimer = window.setTimeout(() => {
        this._isDeviceIdle = true;
        console.log('DeviceContextService: Device idle detected');
      }, 60000); // 60 seconds
    };

    // Reset idle timer on user interaction
    ['mousedown', 'mousemove', 'keypress', 'touchstart', 'scroll'].forEach(event => {
      document.addEventListener(event, resetIdleTimer, { passive: true });
    });

    // Initial call
    resetIdleTimer();
  }

  /**
   * Process image data to estimate ambient light levels
   */
  public processAmbientLight(imageData: ImageData) {
    // Limit how often we process ambient light
    const now = Date.now();
    if (now - this._lastAmbientLightUpdate < this._sampleRate) {
      return;
    }
    this._lastAmbientLightUpdate = now;

    try {
      // Calculate average brightness of the image
      let totalBrightness = 0;
      const data = imageData.data;
      
      // Sample at most 10000 pixels for performance
      const totalPixels = data.length / 4;
      const sampleRate = Math.max(1, Math.floor(totalPixels / 10000));
      
      let sampledPixels = 0;
      
      for (let i = 0; i < data.length; i += 4 * sampleRate) {
        // Calculate brightness from RGB
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Weighted brightness calculation (human eyes are more sensitive to green)
        const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        totalBrightness += brightness;
        sampledPixels++;
      }
      
      // Calculate average brightness (0-1)
      const avgBrightness = totalBrightness / sampledPixels;
      
      // Add to running average
      this._brightnessValues.push(avgBrightness);
      if (this._brightnessValues.length > this._maxSamples) {
        this._brightnessValues.shift();
      }
      
      // Only update after collecting enough samples
      this._sampleCount++;
      if (this._sampleCount >= 5) {
        this.updateAmbientLight();
      }
    } catch (error) {
      console.error('Error processing ambient light:', error);
    }
  }

  /**
   * Update ambient light classification based on collected samples
   */
  private updateAmbientLight() {
    try {
      // Calculate average from collected samples
      const sum = this._brightnessValues.reduce((acc, val) => acc + val, 0);
      const avg = sum / this._brightnessValues.length;
      
      // Classify light level
      let newAmbientLight: 'low' | 'medium' | 'high';
      
      if (avg < 0.25) {
        newAmbientLight = 'low';
      } else if (avg < 0.6) {
        newAmbientLight = 'medium';
      } else {
        newAmbientLight = 'high';
      }
      
      // Only log if changed
      if (this._ambientLight !== newAmbientLight) {
        console.log(`DeviceContextService: Ambient light changed from ${this._ambientLight} to ${newAmbientLight} (brightness: ${avg.toFixed(2)})`);
        this._ambientLight = newAmbientLight;
      }
    } catch (error) {
      console.error('Error updating ambient light:', error);
    }
  }

  /**
   * Reset ambient light detection
   */
  public resetAmbientLight() {
    this._ambientLight = 'medium';
    this._brightnessValues = [];
    this._sampleCount = 0;
    this._lastAmbientLightUpdate = 0;
  }

  // Getters for device context information
  get batteryLevel(): number {
    return this._batteryLevel;
  }

  get isBatterySavingMode(): boolean {
    return this._isBatterySavingMode;
  }

  get isDeviceIdle(): boolean {
    return this._isDeviceIdle;
  }

  get isBackgrounded(): boolean {
    return this._isBackgrounded;
  }

  get ambientLight(): 'low' | 'medium' | 'high' {
    return this._ambientLight;
  }
}

// Singleton instance
const deviceContextService = new DeviceContextService();
export default deviceContextService;
