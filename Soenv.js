// Soenv.js 
import AsyncStorage from '@react-native-async-storage/async-storage';


export const getCurrentEnvironment = async () => {
  try {
    const saved = await AsyncStorage.getItem('SERVER_CONFIG');
    if (!saved) return null;
    const config = JSON.parse(saved);
    return config.environment || null;
  } catch (err) {
    console.log('getCurrentEnvironment error:', err);
    return null;
  }
};


export const soKey = (prefix, environment, soNumber) =>
  `${prefix}_${environment}_${soNumber}`;


export const envListKey = (prefix, environment) =>
  `${prefix}_${environment}`;

export const envLabel = (environment) => environment || '';