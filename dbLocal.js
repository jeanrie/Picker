// dbLocal.js (Fixed SQLite Init)
import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

let db = null;

// Initialize DB and create tables
export const initDB = async () => {
  try {
    if (!db) {
      db = await SQLite.openDatabase({ name: 'so_local.db', location: 'default' });
    }

    await db.transaction(tx => {
      // Header table
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS so_header (
          so_number TEXT PRIMARY KEY,
          customer TEXT,
          pono TEXT,
          remarks TEXT,
          status TEXT
        )`
      );

      // Items table
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS so_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          so_number TEXT,
          barcode TEXT,
          description TEXT,
          qty REAL,
          FOREIGN KEY(so_number) REFERENCES so_header(so_number)
        )`
      );

      // Serials table
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS so_serials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          so_number TEXT,
          barcode TEXT,
          serial TEXT,
          UNIQUE(so_number, serial),
          FOREIGN KEY(so_number) REFERENCES so_header(so_number)
        )`
      );
    });

    console.log('SQLite DB initialized successfully.');
  } catch (err) {
    console.log('SQLite init error:', err);
  }
};

// Return DB object
export const getDB = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return db;
};