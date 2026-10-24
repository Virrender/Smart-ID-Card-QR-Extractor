// config.js
import Constants from 'expo-constants';

/**
 * Smart Auto-Discovery for Backend API URL:
 * When running via Expo Go, Expo already knows your laptop's IP address
 * because it connects to Metro bundler on port 8081.
 * We extract that same IP so you NEVER have to manually edit config.js
 * when switching Wi-Fi or mobile hotspots!
 */
const getAutoApiBase = () => {
  // 1. Try Expo SDK hostUri (e.g. "172.20.10.2:8081")
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:8000`;
    }
  }

  // 2. Default fallback (Current iPhone hotspot IP)
  return "http://172.20.10.2:8000";
};

export const API_BASE = getAutoApiBase();
