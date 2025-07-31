/**
 * Loading Indicator Component
 * 
 * Provides a reusable loading spinner with shimmer effects for CLI applications.
 * Features animated spinner frames and optional text shimmer animation.
 */

/**
 * Configuration options for the loading indicator
 */
export interface LoadingOptions {
  /** Whether to enable shimmer effect on the loading text */
  shimmer?: boolean;
}

/**
 * A customizable loading indicator class for terminal applications
 * 
 * Features:
 * - Animated spinner with multiple frames
 * - Optional shimmer effect on loading text
 * - Cursor management (hide/show)
 * - Promise wrapper for async operations
 */
export class LoadingIndicator {
  /** Timer reference for the animation interval */
  private interval: Timer | null = null;
  
  /** Current frame index for spinner animation */
  private frame = 0;
  
  /** Array of Unicode spinner characters for animation */
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  
  /** Current position for shimmer effect animation */
  private shimmerFrame = 0;
  
  /**
   * Creates shimmer effect on text by applying different colors to characters
   * based on their distance from the current shimmer position
   * 
   * @param text - The text to apply shimmer effect to
   * @param position - Current shimmer position
   * @returns Text with ANSI color codes for shimmer effect
   */
  private createShimmerText(text: string, position: number): string {
    const chars = text.split('');
    
    return chars.map((char, i) => {
      const distance = Math.abs(i - position);
      if (distance === 0) {
        // Bright white, bold for the shimmer highlight
        return `\x1b[97m\x1b[1m${char}\x1b[0m`;
      } else if (distance === 1) {
        // Light gray for adjacent characters
        return `\x1b[37m${char}\x1b[0m`;
      } else if (distance === 2) {
        // Dark gray for nearby characters
        return `\x1b[90m${char}\x1b[0m`;
      } else {
        // Dim for distant characters
        return `\x1b[2m${char}\x1b[0m`;
      }
    }).join('');
  }
  
  /**
   * Starts the loading animation
   * 
   * @param message - Loading message to display (default: 'Loading')
   * @param options - Configuration options for the loading indicator
   */
  start(message = 'Loading', options: LoadingOptions = {}) {
    // Hide cursor for cleaner animation
    process.stdout.write('\x1b[?25l');
    const fullText = `${message}...`;
    const { shimmer = true } = options;
    
    this.interval = setInterval(() => {
      const spinner = this.frames[this.frame];
      const displayText = shimmer 
        ? this.createShimmerText(fullText, this.shimmerFrame)
        : fullText;
      
      // Write spinner and text, overwriting previous line
      process.stdout.write(`\r${spinner} ${displayText}`);
      
      // Advance animation frames
      this.frame = (this.frame + 1) % this.frames.length;
      if (shimmer) {
        this.shimmerFrame = (this.shimmerFrame + 1) % (fullText.length + 4);
      }
    }, 120); // 120ms interval for smooth animation
  }
  
  /**
   * Stops the loading animation and cleans up the display
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Clear the current line and show cursor
    process.stdout.write('\r\x1b[K');
    process.stdout.write('\x1b[?25h');
  }
  
  /**
   * Wraps a promise with loading animation
   * Automatically starts loading, waits for promise completion, then stops loading
   * 
   * @param promise - The promise to wait for
   * @param message - Loading message to display
   * @param options - Configuration options for the loading indicator
   * @returns The result of the promise
   * @throws Re-throws any error from the promise after stopping the loading animation
   */
  async withLoading<T>(promise: Promise<T>, message = 'Loading', options: LoadingOptions = {}): Promise<T> {
    this.start(message, options);
    try {
      const result = await promise;
      this.stop();
      return result;
    } catch (error) {
      this.stop();
      throw error;
    }
  }
}

/**
 * Global loading indicator instance for use throughout the application
 */
export const loading = new LoadingIndicator();