/**
 * Nango Runtime Configuration
 * 
 * This file provides runtime configuration for Nango that works
 * even when environment variables aren't available at build time.
 */

/**
 * Get Nango server URL at runtime
 * This works even if NEXT_PUBLIC_NANGO_SERVER_URL isn't set at build time
 * 
 * IMPORTANT: If page is HTTPS, Nango server URL must also be HTTPS (or use proxy)
 */
export function getNangoServerUrl(): string {
  // First, try environment variable (set at build time)
  if (process.env.NEXT_PUBLIC_NANGO_SERVER_URL) {
    const envUrl = process.env.NEXT_PUBLIC_NANGO_SERVER_URL;
    
    // If page is HTTPS but env URL is HTTP, warn and try to fix
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      if (envUrl.startsWith('http://')) {
        console.warn('⚠️ Nango Config: Page is HTTPS but Nango URL is HTTP. This will cause Mixed Content errors.');
        console.warn('⚠️ Nango Config: Consider using HTTPS for Nango or the ngrok proxy URL.');
        // Try to convert to HTTPS (if Nango supports it)
        const httpsUrl = envUrl.replace('http://', 'https://');
        console.warn('⚠️ Nango Config: Attempting HTTPS version:', httpsUrl);
        return httpsUrl;
      }
    }
    
    return envUrl;
  }
  
  // Runtime detection from browser
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const protocol = window.location.protocol; // Use same protocol as current page
    
    // If page is HTTPS, Nango must also be HTTPS (or use proxy)
    if (protocol === 'https:') {
      // For HTTPS pages, we need HTTPS Nango server OR use ngrok proxy
      // Check if ngrok proxy URL is available
      const ngrokUrl = process.env.NEXT_PUBLIC_NANGO_PROXY_URL;
      if (ngrokUrl) {
        console.log('🔧 Nango Config: Using ngrok proxy URL for HTTPS compatibility:', ngrokUrl);
        return ngrokUrl;
      }
      
      // Try HTTPS version of local server
      const httpsUrl = `https://${host}:3003`;
      console.log('🔧 Nango Config: Auto-detected HTTPS server URL:', httpsUrl);
      console.warn('⚠️ Nango Config: Ensure Nango server supports HTTPS on port 3003');
      return httpsUrl;
    } else {
      // HTTP page - can use HTTP Nango
      const serverUrl = `http://${host}:3003`;
      console.log('🔧 Nango Config: Auto-detected HTTP server URL:', serverUrl);
      return serverUrl;
    }
  }
  
  // Server-side fallback
  return 'http://localhost:3003';
}

/**
 * Get Nango public key
 */
export function getNangoPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY || null;
}

/**
 * Validate Nango configuration
 */
export function validateNangoConfig(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!getNangoPublicKey()) {
    errors.push('NEXT_PUBLIC_NANGO_PUBLIC_KEY is not set');
  }
  
  const serverUrl = getNangoServerUrl();
  
  // Check for localhost issues
  if (serverUrl.includes('localhost') && typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      errors.push(
        `Nango server URL is localhost but you're accessing from ${currentHost}. ` +
        `Set NEXT_PUBLIC_NANGO_SERVER_URL=http://${currentHost}:3003 in your .env file`
      );
    }
  }
  
  // Check for Mixed Content (HTTPS page + HTTP WebSocket)
  if (typeof window !== 'undefined') {
    const isHttpsPage = window.location.protocol === 'https:';
    const isHttpNango = serverUrl.startsWith('http://');
    
    if (isHttpsPage && isHttpNango) {
      warnings.push(
        'Mixed Content Warning: Page is HTTPS but Nango URL is HTTP. ' +
        'This will cause WebSocket connection failures. ' +
        'Options: 1) Use HTTPS for Nango server, 2) Use ngrok proxy URL, or 3) Access your app via HTTP'
      );
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

