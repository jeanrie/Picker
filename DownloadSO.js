// DownloadSO.js (Fixed: SQLite Init + Safe Transactions)
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator, DeviceEventEmitter,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { executeQuery } from './db'; // remote server query
import { initDB, getDB } from './dbLocal'; // local SQLite

export default function DownloadSO({ navigation }) {
  const [soNumber, setSoNumber] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dbConfig, setDbConfig] = useState(null);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    loadLocalSO(); // initial load

    const listener = DeviceEventEmitter.addListener('SO_UPLOADED', (soNumber) => {
      console.log('Reload DownloadSO for deleted SO:', soNumber);
      loadLocalSO(); // reload list
    });

    return () => listener.remove(); // clean up
  }, []);

  // Load server config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const saved = await AsyncStorage.getItem('SERVER_CONFIG');
        if (!saved) throw new Error('Server config not found');
        setDbConfig(JSON.parse(saved));
      } catch (err) {
        console.log('Error loading server config:', err);
        Alert.alert('Error', 'Server configuration not set. Go to Settings first.');
      }
    };
    loadConfig();
  }, []);

  // Initialize DB and load local SO
  useEffect(() => {
    const initAndLoad = async () => {
      try {
        await initDB();           // create tables
        setDbReady(true);         // DB ready flag
        await loadLocalSO();      // load local records
      } catch (err) {
        console.log('DB init/load error:', err);
      }
    };
    initAndLoad();
  }, []);

  // Load local SO records
  const loadLocalSO = async () => {
    try {
      const db = getDB();
      const [headerRes] = await db.executeSql(`SELECT * FROM so_header ORDER BY so_number DESC`);
      const headers = headerRes.rows.raw();
      const list = [];

      for (let so of headers) {
        const [itemsRes] = await db.executeSql(`SELECT * FROM so_items WHERE so_number = ?`, [so.so_number]);
        list.push({
          id: so.so_number,
          so: so.so_number,
          customer: so.customer,
          pono: so.pono,
          remarks: so.remarks,
          status: so.status,
          items: itemsRes.rows.raw(),
        });
      }

      setRecords(list);
    } catch (err) {
      console.log('Load local error:', err);
    }
  };

  // Download SO from server
  const fetchSO = async (soNum = '') => {
    if (!dbConfig || !soNum || !dbReady) return;
    setLoading(true);

    try {
      const pick1Table = `[${dbConfig.mainDB}].[dbo].[PICK1]`;
      const pick2Table = `[${dbConfig.mainDB}].[dbo].[PICK2]`;
      const so1Table = `[${dbConfig.subDB}].[dbo].[SO1]`;
      const so2Table = `[${dbConfig.subDB}].[dbo].[SO2]`;

      // --- Check if SO already picked ---
      const checkQuery = `SELECT COUNT(*) AS cnt FROM ${pick1Table} WHERE refsono = '${soNum}'`;
      const check = await executeQuery(checkQuery);
      if (check?.[0]?.cnt > 0) {
        const proceed = await new Promise(resolve => {
          Alert.alert(
            'SO Already Picked',
            'This SO was already picked. Edit?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Edit', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) {
          setLoading(false);
          return;
        }
      }

      // --- Fetch remote headers/items/serials first ---
      const headers = await executeQuery(
        `SELECT tseqno, customer, pono, remarks FROM ${so1Table} WHERE tseqno = '${soNum}'`
      );

      if (!headers || headers.length === 0) {
        Alert.alert('SO Not Found', `SO ${soNum} does not exist.`);
        setLoading(false);
        return;
      }

      const itemsMap = {};
      const serialsMap = {};

      for (let so of headers) {
        itemsMap[so.tseqno] = await executeQuery(
          `SELECT barcode, [desc], qty FROM ${so2Table} WHERE tseqno = '${so.tseqno}'`
        );
        serialsMap[so.tseqno] = await executeQuery(
          `SELECT LTRIM(RTRIM(barcode)) AS barcode, serialno FROM ${pick2Table} WHERE refsono = '${so.tseqno}'`
        );
      }

      // --- Insert into SQLite (sync inside transaction) ---
      const db = getDB();
      db.transaction(tx => {
        headers.forEach(so => {
          // Header
          tx.executeSql(
            `INSERT INTO so_header (so_number, customer, pono, remarks, status)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(so_number) DO UPDATE SET
               customer = excluded.customer,
               pono = excluded.pono,
               remarks = excluded.remarks`,
            [so.tseqno, so.customer, so.pono, so.remarks, 'NEW']
          );

          // Delete old items & serials
          tx.executeSql(`DELETE FROM so_items WHERE so_number = ?`, [so.tseqno]);
          tx.executeSql(`DELETE FROM so_serials WHERE so_number = ?`, [so.tseqno]);

          // Insert items
          const items = itemsMap[so.tseqno] || [];
          items.forEach(item => {
            tx.executeSql(
              `INSERT INTO so_items (so_number, barcode, description, qty) VALUES (?, ?, ?, ?)`,
              [so.tseqno, (item.barcode || '').trim(), item.desc, item.qty]
            );
          });

          // Insert serials
          const serials = serialsMap[so.tseqno] || [];
          serials.forEach(s => {
            if (s.serialno) {
              tx.executeSql(
                `INSERT OR IGNORE INTO so_serials (so_number, barcode, serial) VALUES (?, ?, ?)`,
                [so.tseqno, s.barcode.trim(), s.serialno.trim()]
              );
            }
          });
        });
      });

      Alert.alert('Success', `SO ${soNum} downloaded.`);
      await loadLocalSO();

    } catch (err) {
      console.log('Download error:', err);
      Alert.alert('Error', 'Failed to download SO.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => fetchSO(soNumber.trim());

  // Delete SO
  const handleDelete = async item => {
    Alert.alert('Delete SO', `Delete SO ${item.so}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const db = getDB();
            await db.executeSql(`DELETE FROM so_header WHERE so_number = ?`, [item.so]);
            await loadLocalSO();
          } catch (err) {
            console.log('Delete error:', err);
          }
        },
      },
    ]);
  };

  const handleSelect = item => {
    navigation.navigate('PickSerial', {
      screen: 'PickDetails',
      params: { soNumber: item.so, customer: item.customer, soItems: item.items },
    });
  };

  const renderRightActions = item => (
    <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => (
    <Swipeable renderRightActions={() => renderRightActions(item)}>
      <TouchableOpacity style={styles.card} onPress={() => handleSelect(item)}>
        <Text style={styles.soText}>SO NO: {item.so}</Text>
        <Text style={styles.remarksText}>Items: {item.items.length}</Text>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.headerBox}>
            <Text style={styles.headerTitle}>Download SO for Picking</Text>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="SO number"
              value={soNumber}
              onChangeText={setSoNumber}
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.iconBtn} onPress={handleDownload}>
              <Icon name="download" size={26} color="#1C4D8D" />
            </TouchableOpacity>
          </View>

          {loading && <ActivityIndicator size="large" color="#1C4D8D" style={{ marginVertical: 10 }} />}

          <Text style={styles.sectionTitle}>SO Records</Text>
          <FlatList
            data={records}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 30 }}
            ListEmptyComponent={<Text style={styles.emptyText}>No records found</Text>}
          />
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 8 : 0 },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  headerBox: { backgroundColor: '#1C4D8D', paddingVertical: 16, borderRadius: 10, marginBottom: 16 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  input: { flex: 1, backgroundColor: '#f2f2f2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14 },
  iconBtn: { marginLeft: 10, padding: 8, borderRadius: 8, backgroundColor: '#EAF0FA' },
  sectionTitle: { marginTop: 10, marginBottom: 5, fontSize: 16, fontWeight: '700', color: '#1C4D8D', textAlign: 'center' },
  soText: { fontSize: 16, fontWeight: '600' },
  remarksText: { fontSize: 12, color: '#666', marginTop: 2 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#999' },
  card: { backgroundColor: '#F7F9FC', padding: 20, borderRadius: 10, marginBottom: 12 },
  deleteBtn: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 80, marginVertical: 4, borderRadius: 10 },
  deleteText: { color: '#fff', fontWeight: '700', marginTop: 2 },
});