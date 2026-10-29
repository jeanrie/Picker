// dbLocal.js 
import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

let db = null;
let initPromise = null;


const DB_NAME = 'so_local_v2.db';

export const initDB = () => {
  if (!initPromise) {
    initPromise = (async () => {
      if (!db) {
        db = await SQLite.openDatabase({ name: DB_NAME, location: 'default' });
      }

      await db.transaction(tx => {
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS so_header (
            environment TEXT NOT NULL,
            so_number TEXT NOT NULL,
            customer TEXT,
            pono TEXT,
            remarks TEXT,
            status TEXT,
            PRIMARY KEY (environment, so_number)
          )`
        );

        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS so_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            environment TEXT NOT NULL,
            so_number TEXT NOT NULL,
            barcode TEXT,
            description TEXT,
            qty REAL
          )`
        );

        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS so_serials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            environment TEXT NOT NULL,
            so_number TEXT NOT NULL,
            barcode TEXT,
            serial TEXT,
            UNIQUE(environment, so_number, serial)
          )`
        );

        tx.executeSql(
          `CREATE INDEX IF NOT EXISTS idx_items_env_so ON so_items (environment, so_number)`
        );
        tx.executeSql(
          `CREATE INDEX IF NOT EXISTS idx_serials_env_so ON so_serials (environment, so_number)`
        );
      });

      console.log('SQLite DB initialized successfully.');
    })().catch(err => {
      initPromise = null; // allow retry
      console.log('SQLite init error:', err);
      throw err;
    });
  }
  return initPromise;
};

export const getDB = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return db;
};


export const deleteSO = async (environment, soNumber) => {
  await initDB();
  const database = getDB();

  await database.transaction(tx => {
    tx.executeSql(
      `DELETE FROM so_serials WHERE environment = ? AND so_number = ?`,
      [environment, soNumber]
    );
    tx.executeSql(
      `DELETE FROM so_items WHERE environment = ? AND so_number = ?`,
      [environment, soNumber]
    );
    tx.executeSql(
      `DELETE FROM so_header WHERE environment = ? AND so_number = ?`,
      [environment, soNumber]
    );
  });
};