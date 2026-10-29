// DownloadSO.js 
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
  ActivityIndicator,
  DeviceEventEmitter,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { executeQuery, getServerConfig } from './db'; 
import { initDB, getDB, deleteSO } from './dbLocal'; 
import { getCurrentEnvironment, envLabel } from './Soenv';
import { quoteIdent } from './serverConfig'; 

export default function DownloadSO({ navigation }) {
  const [soNumber, setSoNumber] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [environment, setEnvironment] = useState(null);


  const loadLocalSO = async () => {
    try {
      const env = await getCurrentEnvironment();
      setEnvironment(env);

      if (!env) {
        setRecords([]);
        return;
      }

      await initDB();
      const db = getDB();

      const [headerRes] = await db.executeSql(
        `SELECT * FROM so_header WHERE environment = ? ORDER BY so_number DESC`,
        [env]
      );
      const headers = headerRes.rows.raw();
      const list = [];

      for (let so of headers) {
        const [itemsRes] = await db.executeSql(
          `SELECT * FROM so_items WHERE environment = ? AND so_number = ?`,
          [env, so.so_number]
        );
        list.push({
          id: so.so_number,
          environment: env,
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

  useEffect(() => {
    loadLocalSO(); // initial load

  
    const unsubscribe = navigation.addListener('focus', loadLocalSO);

    const listener = DeviceEventEmitter.addListener('SO_UPLOADED', () => {
      loadLocalSO();
    });

    return () => {
      unsubscribe();
      listener.remove();
    };
  }, [navigation]);

  // Download SO from server
  const fetchSO = async (rawSo = '') => {
    const soNum = String(rawSo).replace(/'/g, "''");
    if (!soNum) return;

    setLoading(true);

    try {
    
      const cfg = await getServerConfig();
      const env = cfg.environment;

      await initDB();

      const pick1Table = `${quoteIdent(cfg.mainDB)}.[dbo].[PICK1]`;
      const pick2Table = `${quoteIdent(cfg.mainDB)}.[dbo].[PICK2]`;
      const so1Table = `${quoteIdent(cfg.subDB)}.[dbo].[SO1]`;
      const so2Table = `${quoteIdent(cfg.subDB)}.[dbo].[SO2]`;

      // Check if SO already picked 
      const check = await executeQuery(
        `SELECT COUNT(*) AS cnt FROM ${pick1Table} WHERE refsono = '${soNum}'`
      );
      if (check?.[0]?.cnt > 0) {
        const proceed = await new Promise(resolve => {
          Alert.alert('SO Already Picked', 'This SO was already picked. Edit?', [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Edit', onPress: () => resolve(true) },
          ]);
        });
        if (!proceed) return;
      }

   
      const headers = await executeQuery(
        `SELECT tseqno, customer, pono, remarks FROM ${so1Table} WHERE tseqno = '${soNum}'`
      );

      if (!headers || headers.length === 0) {
        Alert.alert('SO Not Found', `SO ${rawSo} does not exist in ${envLabel(env)}.`);
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

      // Insert into SQLite 
      const db = getDB();
      await db.transaction(tx => {
        headers.forEach(so => {
          tx.executeSql(
            `INSERT INTO so_header (environment, so_number, customer, pono, remarks, status)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(environment, so_number) DO UPDATE SET
               customer = excluded.customer,
               pono = excluded.pono,
               remarks = excluded.remarks`,
            [env, so.tseqno, so.customer, so.pono, so.remarks, 'NEW']
          );

          // Delete old items & serials 
          tx.executeSql(
            `DELETE FROM so_items WHERE environment = ? AND so_number = ?`,
            [env, so.tseqno]
          );
          tx.executeSql(
            `DELETE FROM so_serials WHERE environment = ? AND so_number = ?`,
            [env, so.tseqno]
          );

          // Insert items
          (itemsMap[so.tseqno] || []).forEach(item => {
            tx.executeSql(
              `INSERT INTO so_items (environment, so_number, barcode, description, qty)
               VALUES (?, ?, ?, ?, ?)`,
              [env, so.tseqno, (item.barcode || '').trim(), item.desc, item.qty]
            );
          });

          // Insert serials
          (serialsMap[so.tseqno] || []).forEach(s => {
            if (s.serialno) {
              tx.executeSql(
                `INSERT OR IGNORE INTO so_serials (environment, so_number, barcode, serial)
                 VALUES (?, ?, ?, ?)`,
                [env, so.tseqno, (s.barcode || '').trim(), String(s.serialno).trim()]
              );
            }
          });
        });
      });

      Alert.alert('Success', `SO ${rawSo} downloaded (${envLabel(env)}).`);
      setSoNumber('');
      await loadLocalSO();
    } catch (err) {
      console.log('Download error:', err);
      Alert.alert('Error', err?.message || 'Failed to download SO.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => fetchSO(soNumber.trim());

  // Delete SO 
  const handleDelete = item => {
    Alert.alert('Delete SO', `Delete SO ${item.so}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSO(item.environment, item.so);
            await loadLocalSO();
          } catch (err) {
            console.log('Delete error:', err);
          }
        },
      },
    ]);
  };

  const renderRightActions = item => (
    <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => (
    <Swipeable renderRightActions={() => renderRightActions(item)}>
      <TouchableOpacity style={styles.card} activeOpacity={1}>
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
            {!!environment && (
              <Text style={styles.serverText}>Server: {envLabel(environment)}</Text>)}
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="SO number"
              value={soNumber}
              onChangeText={setSoNumber}
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.iconBtn} onPress={handleDownload} disabled={loading}>
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
            ListEmptyComponent={<Text style={styles.emptyText}>No records found</Text>}/>
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
  serverText: { color: '#EAF0FA', fontSize: 12, textAlign: 'center', marginTop: 4 },
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