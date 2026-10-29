// db.js

import MSSQL from 'react-native-mssql';
import AsyncStorage from '@react-native-async-storage/async-storage';


export async function getServerConfig() {
  const saved = await AsyncStorage.getItem('SERVER_CONFIG');

  if (!saved) {
    throw new Error('Server configuration not set.');
  }

  const config = JSON.parse(saved);

  if (!config.environment) {
    throw new Error('Server environment has not been selected.');
  }

  if (!config.serverName) {
    throw new Error('Server name/IP is not configured.');
  }

  if (!config.serverUser) {
    throw new Error('SQL Server username is not configured.');
  }

  if (!config.serverPass) {
    throw new Error('SQL Server password is not configured.');
  }

  if (!config.mainDB) {
    throw new Error('Main database is not configured.');
  }

  if (!config.subDB) {
    throw new Error('Sub database is not configured.');
  }

  return config;
}


export async function getConnectionConfig(dbName) {
  const config = await getServerConfig();

  return {
    server: config.serverName,
    username: config.serverUser,
    password: config.serverPass,
    database: dbName || config.mainDB,
    port: 1433,
    timeout: 10,
  };
}


 //Execute SELECT query.

export async function executeQuery(sql, dbName) {
  const config = await getConnectionConfig(dbName);

  try {
    console.log('====================================');
    console.log('[MSSQL] Environment:', (
      await AsyncStorage.getItem('SERVER_CONFIG')
    ));

    console.log('[MSSQL] Database:', config.database);
    console.log('[MSSQL] Query:', sql);
    console.log('====================================');

    await MSSQL.connect(config);

    const result = await MSSQL.executeQuery(sql);

    return result || [];
  } catch (e) {
    console.log('[MSSQL] executeQuery error:', e);
    throw e;
  } finally {
    try {
      await MSSQL.close();
    } catch {}
  }
}


export async function executeNonQuery(sql, dbName) {
  const wrappedSql = `
    ${sql};
    SELECT 1 AS ok;
  `;

  const result = await executeQuery(wrappedSql, dbName);

  return result?.[0]?.ok === 1;
}