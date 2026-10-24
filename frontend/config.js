// config.js
import Constants from 'expo-constants';

/**
 * CARTA BACKEND CONFIGURATION
 * 
 * 1. Cloud Production Deployment:
 * When you deploy your backend Docker container (e.g. on Render, Railway, AWS, DigitalOcean),
 * simply paste your public HTTPS domain here:
 */
export const PRODUCTION_API_URL = ''; // e.g. "https://carta-api.onrender.com"

/**
 * 2. Local Development Auto-Discovery:
 * When running via Expo Go on the same Wi-Fi/Hotspot, Expo automatically knows
 * your computer's IP address because it connects to Metro on port 8081.
 * We extract that same IP so you don't have to reconfigure every time you change Wi-Fi.
 */
const getAutoApiBase = () => {
  // If production URL is defined or running in a standalone APK release build (__DEV__ === false)
  if (!__DEV__ && PRODUCTION_API_URL) {
    return PRODUCTION_API_URL.replace(/\/+$/, '');
  }

  // If a production URL is explicitly provided during testing
  if (PRODUCTION_API_URL && PRODUCTION_API_URL.trim().length > 0) {
    return PRODUCTION_API_URL.replace(/\/+$/, '');
  }

  // Expo SDK hostUri detection (e.g., "172.20.10.2:8081")
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:8000`;
    }
  }

  // Fallback to local subnet / hotspot
  return 'http://172.20.10.2:8000';
};

export const API_BASE = getAutoApiBase();
