// Environment configuration utility
// Centralizes access to environment variables with fallbacks

export const config = {
  // Backend API Configuration
  backendUrl: import.meta.env.VITE_BACKEND_URL ||
    (import.meta.env.PROD
      ? 'https://air-assist-backend.vercel.app'
      : 'http://localhost:3001'),
  websocketUrl: import.meta.env.VITE_WEBSOCKET_URL ||
    (import.meta.env.PROD
      ? 'wss://air-assist-backend.vercel.app/openai-realtime'
      : 'ws://localhost:3001/openai-realtime'),
  
  // Default n8n Configuration
  defaultN8nUrl: import.meta.env.VITE_DEFAULT_N8N_URL || 'https://n8n.dev.quantumos.ai/webhook/air',
  
  // App Configuration
  appName: import.meta.env.VITE_APP_NAME || 'Air Assist',
  appDescription: import.meta.env.VITE_APP_DESCRIPTION || 'Voice-Controlled PWA with Bluetooth Support',
  
  // Development Settings
  nodeEnv: import.meta.env.VITE_NODE_ENV || 'development',
  debugMode: import.meta.env.VITE_DEBUG_MODE === 'true',
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
  
  // Computed URLs
  get healthCheckUrl() {
    return `${this.backendUrl}/health`;
  },
  
  get sessionUrl() {
    return `${this.backendUrl}/api/session`;
  }
};

// Validation function to check required environment variables
export const validateConfig = () => {
  const errors = [];
  
  // Check if backend URL is accessible (in production)
  if (config.isProduction && !config.backendUrl.startsWith('https://')) {
    errors.push('VITE_BACKEND_URL should use HTTPS in production');
  }
  
  if (config.isProduction && !config.websocketUrl.startsWith('wss://')) {
    errors.push('VITE_WEBSOCKET_URL should use WSS in production');
  }
  
  if (errors.length > 0) {
    console.warn('⚠️ Configuration warnings:', errors);
  }
  
  return errors;
};

// Debug function to log configuration (only in development)
export const logConfig = () => {
  if (config.debugMode && config.isDevelopment) {
    console.group('🔧 Environment Configuration');
    console.log('Backend URL:', config.backendUrl);
    console.log('WebSocket URL:', config.websocketUrl);
    console.log('Default n8n URL:', config.defaultN8nUrl);
    console.log('App Name:', config.appName);
    console.log('Environment:', config.nodeEnv);
    console.log('Debug Mode:', config.debugMode);
    console.groupEnd();
  }
};

// Initialize configuration validation and logging
validateConfig();
logConfig();

export default config;
