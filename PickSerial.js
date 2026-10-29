// PickSerial.js 
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  Alert,
  DeviceEventEmitter,
} from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDB, getDB, deleteSO } from './dbLocal';
import { getCurrentEnvironment, soKey, envLabel } from './Soenv';

export default function PickSerial({ navigation }) {
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [environment, setEnvironment] = useState(null);

  const loadDownloadedSO = async () => {
    try {
      const env = await getCurrentEnvironment();
      setEnvironment(env);

      if (!env) {
        setRecords([]);
        return;
      }

      await initDB();
      const db = getDB();

      // Headers for CURRENT environment only
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
        const items = itemsRes.rows.raw();

        const [serialsRes] = await db.executeSql(
          `SELECT * FROM so_serials WHERE environment = ? AND so_number = ?`,
          [env, so.so_number]
        );
        const serials = serialsRes.rows.raw();

        const itemsWithSerials = items.map((item, idx) => {
          const itemSerials = serials.filter(s => s.barcode === item.barcode).map(s => s.serial);
          return {
            ...item,
            serials: itemSerials,
            id: item.id || `${item.barcode}_${so.so_number}_${idx}`,
          };
        });

        // Status from AsyncStorage 
        let savedStatus = 'NEW';
        try {
          const statusFromStorage = await AsyncStorage.getItem(
            soKey('SO_STATUS', env, so.so_number)
          );
          if (statusFromStorage) savedStatus = statusFromStorage;
        } catch (err) {
          console.log('Error loading status from AsyncStorage:', err);
        }

        list.push({
          id: so.so_number,
          environment: env,
          so: so.so_number,
          customer: so.customer,
          pono: so.pono,
          remarks: so.remarks,
          status: savedStatus,
          items: itemsWithSerials,
        });
      }

      setRecords(list);
    } catch (err) {
      console.log('Failed to load downloaded SO from SQLite:', err);
      Alert.alert('Error', 'Failed to load downloaded SO.');
    }
  };

  useEffect(() => {
    loadDownloadedSO();
    const listener = DeviceEventEmitter.addListener('SO_UPLOADED', () => {
      loadDownloadedSO();
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadDownloadedSO();
    });
    return unsubscribe;
  }, [navigation]);

  const handlePress = (item) => {
    navigation.navigate('PickDetails', {
      environment: item.environment,
      soNumber: item.so,
      customer: item.customer,
      soItems: item.items,
    });
  };

  const handleDelete = (item) => {
    Alert.alert('Delete SO', 'Are you sure you want to delete this SO?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSO(item.environment, item.so);
            setRecords(prev => prev.filter(r => r.so !== item.so));
            if (selectedId === item.id) setSelectedId(null);
          } catch (err) {
            console.log('Failed to delete SO:', err);
          }
        },
      },
    ]);
  };

  const renderRightActions = (item) => (
    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const getStatusColor = (status) => {
    if (status === 'DONE') return '#D1FAE5';
    if (status === 'IN_PROGRESS') return '#FEF3C7';
    return '#F7F9FC';
  };

  const renderItem = ({ item }) => (
    <Swipeable renderRightActions={() => renderRightActions(item)}>
      <TouchableOpacity
        style={[
          styles.card,
          { borderColor: selectedId === item.id ? '#FFA500' : 'transparent', borderWidth: selectedId === item.id ? 3 : 0 },
          { backgroundColor: getStatusColor(item.status) },
        ]}
        onPress={() => handlePress(item)}
      >
        <View style={styles.row}>
          <Text style={styles.leftLabel}>SO NO: {item.so}</Text>
          <Text style={styles.rightLabel}>CUSTOMER: {item.customer}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.leftLabel}>PO NO: {item.pono}</Text>
          <Text style={styles.rightLabel}>REMARKS: {item.remarks}</Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.headerBox}>
            <Text style={styles.headerTitle}>Pick Serial Number</Text>
            {!!environment && (
              <Text style={styles.serverText}>Server: {envLabel(environment)}</Text> )}
          </View>

          <Text style={styles.sectionTitle}>SO Number List</Text>

          <FlatList
            data={records}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Platform.OS === 'android' ? 120 : 30 }}
            renderItem={renderItem}
            ListEmptyComponent={<Text style={styles.emptyText}>No records found</Text>}/>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 8 : 0 },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  headerBox: { backgroundColor: '#1C4D8D', paddingVertical: 16, paddingHorizontal: 12, borderRadius: 10, marginBottom: 16 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  serverText: { color: '#EAF0FA', fontSize: 12, textAlign: 'center', marginTop: 4 },
  sectionTitle: { marginBottom: 5, fontSize: 16, fontWeight: '700', color: '#1C4D8D', textAlign: 'center' },
  card: { padding: 14, borderRadius: 10, marginBottom: 10 },
  row: { flexDirection: 'row', marginTop: 6 },
  leftLabel: { width: 120, fontWeight: '600', fontSize: 14, color: '#111', marginRight: 10 },
  rightLabel: { flex: 1, fontWeight: '600', fontSize: 14, color: '#111', flexWrap: 'wrap' },
  deleteBtn: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 10, borderRadius: 10 },
  deleteText: { color: '#fff', fontWeight: '700' },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#999' },
});