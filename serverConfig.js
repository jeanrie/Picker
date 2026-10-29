// serverConfig.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const ENV_DB_STORAGE_KEY = 'ENV_DB_CONFIG';


export const DEFAULT_ENVIRONMENTS = {
  GREATBUYS: {
    key: 'GREATBUYS',
    label: 'GREATBUYS',
    mainDB: 'HK_UDSdb',
    subDB: 'HK_UDSorderdb',
  },
  HKUDSDEV: {
    key: 'HKUDSDEV',
    label: 'HKUDSDEV',
    mainDB: 'HK_UDSdbSFSDev',
    subDB: 'HK_UDSorderdbSFSDev',
  },
};


export const quoteIdent = (name) => `[${String(name).replace(/]/g, ']]')}]`;


export const getEnvironments = async () => {
  let saved = {};
  try {
    const raw = await AsyncStorage.getItem(ENV_DB_STORAGE_KEY);
    if (raw) saved = JSON.parse(raw) || {};
  } catch (err) {
    console.log('getEnvironments error:', err);
  }

  const result = {};
  Object.keys(DEFAULT_ENVIRONMENTS).forEach((key) => {
    const def = DEFAULT_ENVIRONMENTS[key];
    const s = saved[key] || {};
    result[key] = {
      ...def,
      mainDB: String(s.mainDB || '').trim() || def.mainDB,
      subDB: String(s.subDB || '').trim() || def.subDB,
    };
  });
  return result;
};

export const getEnvironmentConfig = async (environment) => {
  const all = await getEnvironments();
  return all[environment] || null;
};

// Save DB names for ONE environment.
export const saveEnvironmentDBs = async (environment, mainDB, subDB) => {
  const raw = await AsyncStorage.getItem(ENV_DB_STORAGE_KEY);
  const saved = raw ? JSON.parse(raw) : {};
  saved[environment] = {
    mainDB: String(mainDB).trim(),
    subDB: String(subDB).trim(),
  };
  await AsyncStorage.setItem(ENV_DB_STORAGE_KEY, JSON.stringify(saved));
};