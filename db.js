// db.js
import MSSQL from 'react-native-mssql';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Load server config from AsyncStorage
 */
export async function getConnectionConfig(dbName) {
  const saved = await AsyncStorage.getItem('SERVER_CONFIG');
  if (!saved) throw new Error('Server configuration not set');

  const { serverName, mainDB, subDB, serverUser, serverPass } = JSON.parse(saved);

  return {
    server: serverName,
    username: serverUser,
    password: serverPass,
    database: dbName || mainDB, // default to mainDB
    port: 1433,
    timeout: 10,
  };
}

/**
 * Execute a SELECT query that returns rows
 */
export async function executeQuery(sql, dbName) {
  const config = await getConnectionConfig(dbName);
  try {
    await MSSQL.connect(config);
    const result = await MSSQL.executeQuery(sql);
    return result || [];
  } catch (e) {
    console.log('executeQuery error:', e);
    throw e;
  } finally {
    try { await MSSQL.close(); } catch {}
  }
}

/**
 * Execute an INSERT/UPDATE/DELETE that must return a result set
 */
export async function executeNonQuery(sql, dbName) {
  const wrappedSql = `
    ${sql};
    SELECT 1 AS ok;
  `;
  const result = await executeQuery(wrappedSql, dbName);
  return result?.[0]?.ok === 1;
}