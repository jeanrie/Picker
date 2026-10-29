// UploadSO.js 
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  Platform,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView, DeviceEventEmitter
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { executeQuery, executeNonQuery } from './db';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { getDB } from './dbLocal';
import { getCurrentEnvironment, soKey, envListKey, envLabel } from './Soenv';

export default function UploadSO({ navigation }) {
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState('');
  const [environment, setEnvironment] = useState(null);

  // Load uploaded SOs for the CURRENT environment only
  const loadSOs = async () => {
    try {
      const env = await getCurrentEnvironment();
      setEnvironment(env);

      if (!env) {
        setRecords([]);
        return;
      }

      const savedSOs = await AsyncStorage.getItem(envListKey('UPLOADED_SOS', env));
      const successRaw = await AsyncStorage.getItem(envListKey('SUCCESS_UPLOADED_SOS', env));
      const partialRaw = await AsyncStorage.getItem(envListKey('PARTIAL_UPLOADED_SOS', env));

      const soList = savedSOs ? JSON.parse(savedSOs) : [];
      const successList = successRaw ? JSON.parse(successRaw) : [];
      const partialList = partialRaw ? JSON.parse(partialRaw) : [];

      const formatted = soList.map((so, idx) => {

        const isUploaded = successList.includes(so);
        const isPartial = partialList.includes(so);

        return {
          id: `${idx}`,
          environment: env,
          so,
          uploaded: isUploaded,
          partial: !isUploaded && isPartial
        };

      });

      setRecords(formatted);

    } catch (err) {
      console.log('Error loading uploaded SOs:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadSOs);
    return unsubscribe;
  }, [navigation]);

  const handlePressCard = (item) => {
    setSelectedId(item.id);

    if (item.uploaded) {
      navigation.navigate('UploadPickSO', { environment: item.environment, soNumber: item.so, soItems: [] });
    } else {
      navigation.navigate('UploadPickSO', { environment: item.environment, soNumber: item.so });
    }
  };

  const getNextRefId = async () => {
    const yearPrefix = new Date().getFullYear() % 100;
    const rows = await executeQuery(
      `SELECT ISNULL(MAX(refid), ${yearPrefix}00000) + 1 AS nextRefId 
       FROM PICK1 WHERE refid LIKE '${yearPrefix}%'`
    );
    return rows[0].nextRefId;
  };


  const uploadPickSO = async (environment, soNumber) => {
    try {

      const loggedRaw = await AsyncStorage.getItem('LOGGED_IN_USER');
      if (!loggedRaw) throw new Error('No logged-in user found. Please login again.');

      const loggedUser = JSON.parse(loggedRaw);
      const empId = Number(loggedUser.user || loggedUser.ID);
      if (!empId) throw new Error('Invalid user ID');

      const savedSerialsRaw = await AsyncStorage.getItem(soKey('SO_SERIALS', environment, soNumber));
      const savedSerials = savedSerialsRaw ? JSON.parse(savedSerialsRaw) : [];

      const failedSerials = [];
      const successSerials = [];

      if (!savedSerials.length) {
        return {
          soNumber,
          success: false,
          failedSerials: [{ desc: '-', serial: '-', reason: 'No serials scanned' }]
        };
      }

      // VALIDATE SERIALS
      for (const item of savedSerials) {
        const barcode = String(item.barcode || '').replace(/'/g, "''");
        const serials = Array.isArray(item.serials) ? item.serials : [];

        if (serials.length === 0) {
          failedSerials.push({
            desc: item.desc || '-',
            serial: '-',
            reason: 'No serial scanned'
          });
          continue;
        }

        for (const serial of serials) {

          const cleanSerial = String(serial).replace(/'/g, "''");

          const existsInMaster = await executeQuery(
            `SELECT TOP 1 serialno 
            FROM serial 
            WHERE barcode='${barcode}' AND serialno='${cleanSerial}'`
          );

          if (existsInMaster.length === 0) {
            failedSerials.push({
              desc: item.desc || '-',
              serial: serial,
              reason: 'Serial not found'
            });
            continue;
          }

          const dup = await executeQuery(
            `SELECT TOP 1 serialno 
            FROM PICK2 
            WHERE serialno='${cleanSerial}' AND refsono != '${soNumber}'`
          );

          if (dup.length > 0) {
            failedSerials.push({
              desc: item.desc || '-',
              serial: serial,
              reason: 'Serial already picked'
            });
            continue;
          }

          successSerials.push({
            desc: item.desc,
            barcode,
            serial: cleanSerial
          });
        }
      }

      // STOP if no valid serials
      if (successSerials.length === 0) {
        return {
          soNumber,
          success: false,
          failedSerials
        };
      }

      // CLEAN OLD DATA
      await executeNonQuery(`DELETE FROM PICK2 WHERE refsono='${soNumber}'`);
      await executeNonQuery(`DELETE FROM PICK1 WHERE refsono='${soNumber}'`);

      const refId = await getNextRefId();
      const soInt = parseInt(soNumber, 10);

      await executeNonQuery(
        `INSERT INTO PICK1 (refid, refsono, date, ispickonline)
        VALUES (${refId}, ${soInt}, GETDATE(), NULL)`
      );

      // INSERT VALID SERIALS
      for (const s of successSerials) {

        await executeNonQuery(
          `INSERT INTO PICK2
          (refid, refsono, barcode, serialno, pickby, date, ispickonline, isdone)
          VALUES (
            ${refId},
            ${soInt},
            '${s.barcode}',
            '${s.serial}',
            ${empId},
            GETDATE(),
            NULL,
            NULL
          )`
        );
      }

      return {
        soNumber,
        success: true,
        successSerials,
        failedSerials
      };

    } catch (err) {

      console.log('UPLOAD FAILED:', err);

      return {
        soNumber,
        success: false,
        successSerials: [],
        failedSerials: [{
          desc: '-',
          serial: '-',
          reason: err.message
        }]
      };

    }
  };


  const handleUpload = async () => {
    if (!records.length || !environment) return;
    setUploading(true);

    const env = environment;
    const failedUploads = [];
    const successUploads = [];
    const recordsCopy = [...records];


    for (const r of recordsCopy) {
      if (r.uploaded) continue;

      const result = await uploadPickSO(env, r.so);

      // SUCCESS SERIALS
      if (result.successSerials && result.successSerials.length > 0) {

        successUploads.push(result);

        const allSuccess =
          result.successSerials &&
          result.successSerials.length > 0 &&
          (!result.failedSerials || result.failedSerials.length === 0);



        // mark uploaded or partial

        const someFailed = result.failedSerials && result.failedSerials.length > 0;

        if (allSuccess) {

          const successKey = envListKey('SUCCESS_UPLOADED_SOS', env);
          const successRaw = await AsyncStorage.getItem(successKey);
          const success = successRaw ? JSON.parse(successRaw) : [];

          if (!success.includes(r.so)) {
            success.push(r.so);
            await AsyncStorage.setItem(successKey, JSON.stringify(success));
          }

          // remove from partial if previously partial
          const partialKey = envListKey('PARTIAL_UPLOADED_SOS', env);
          const partialRaw = await AsyncStorage.getItem(partialKey);
          const partial = partialRaw ? JSON.parse(partialRaw) : [];
          const updatedPartial = partial.filter(p => p !== r.so);
          await AsyncStorage.setItem(partialKey, JSON.stringify(updatedPartial));

        }

        if (someFailed && !allSuccess) {

          const partialKey = envListKey('PARTIAL_UPLOADED_SOS', env);
          const partialRaw = await AsyncStorage.getItem(partialKey);
          const partial = partialRaw ? JSON.parse(partialRaw) : [];

          if (!partial.includes(r.so)) {
            partial.push(r.so);
            await AsyncStorage.setItem(partialKey, JSON.stringify(partial));
          }

        }

        setRecords(prev =>
          prev.map(rec =>
            rec.so === r.so
              ? { ...rec, uploaded: allSuccess, partial: someFailed && !allSuccess }
              : rec
          )
        );

        // remove SO locally ONLY if all serials are successful
        if (!result.failedSerials || result.failedSerials.length === 0) {

          await AsyncStorage.removeItem(soKey('SO_SERIALS', env, r.so));

          try {
            const db = getDB();

            await db.executeSql(
              `DELETE FROM so_serials WHERE environment = ? AND so_number = ?`,
              [env, r.so]
            );
            await db.executeSql(
              `DELETE FROM so_items WHERE environment = ? AND so_number = ?`,
              [env, r.so]
            );
            await db.executeSql(
              `DELETE FROM so_header WHERE environment = ? AND so_number = ?`,
              [env, r.so]
            );

            DeviceEventEmitter.emit('SO_UPLOADED', r.so);

          } catch (err) {
            console.log('Failed removing SO from SQLite:', err);
          }

        }
      }

      // FAILED SERIALS
      if (result.failedSerials && result.failedSerials.length > 0) {
        failedUploads.push(result);
      }
    }

    setUploading(false);

  
    let modalMsg = '';

    if (successUploads.length) {

      for (const s of successUploads) {
        const key = soKey('SUCCESS_SERIALS', env, s.soNumber);
        const existing = await AsyncStorage.getItem(key);
        const prev = existing ? JSON.parse(existing) : [];

        const newSerials = s.successSerials.map(ss => ss.serial);
        const merged = [...new Set([...prev, ...newSerials])];

        await AsyncStorage.setItem(key, JSON.stringify(merged));
      }

      const successMsg = successUploads
        .map(s =>
          (s.successSerials || [])
            .map(
              ss =>
                `SO No: ${s.soNumber}\nDescription: ${ss.desc}\nSerial no: ${ss.serial}`
            )
            .join('\n\n')
        )
        .join('\n\n');

      modalMsg += `✅ Successes:\n${successMsg}\n\n`;

    }

    if (failedUploads.length) {

      for (const f of failedUploads) {
        const key = soKey('FAILED_SERIALS', env, f.soNumber);
        const existing = await AsyncStorage.getItem(key);
        const prev = existing ? JSON.parse(existing) : [];

        const newSerials = f.failedSerials.map(fs => fs.serial);
        const merged = [...new Set([...prev, ...newSerials])];

        await AsyncStorage.setItem(key, JSON.stringify(merged));
      }
      const failMsg = failedUploads
        .map(f =>
          f.failedSerials
            .map(
              fs =>
                `SO No: ${f.soNumber}\nDescription: ${fs.desc}\nSerial no: ${fs.serial}\nReason: ${fs.reason}`
            )
            .join('\n\n')
        )
        .join('\n\n');
      modalMsg += `❌ Failures:\n${failMsg}`;
    }

    setModalContent(modalMsg);
    setModalVisible(true);
    await loadSOs();
  };

  
  const handleDelete = async (item) => {
    const env = item.environment;
    const newRecords = records.filter(r => r.so !== item.so);
    setRecords(newRecords);

    await AsyncStorage.setItem(
      envListKey('UPLOADED_SOS', env),
      JSON.stringify(newRecords.filter(r => r.environment === env).map(r => r.so))
    );

  
    const successKey = envListKey('SUCCESS_UPLOADED_SOS', env);
    const uploadedRaw = await AsyncStorage.getItem(successKey);
    const uploaded = uploadedRaw ? JSON.parse(uploadedRaw) : [];
    const updated = uploaded.filter(so => so !== item.so);

    await AsyncStorage.setItem(successKey, JSON.stringify(updated));

    const partialKey = envListKey('PARTIAL_UPLOADED_SOS', env);
    const partialRaw = await AsyncStorage.getItem(partialKey);
    const partial = partialRaw ? JSON.parse(partialRaw) : [];
    const updatedPartial = partial.filter(so => so !== item.so);

    await AsyncStorage.setItem(partialKey, JSON.stringify(updatedPartial));
  };

  const renderRightActions = (item) => (
    <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => {
    const isSelected = selectedId === item.id;
    const cardStyle = item.uploaded
      ? styles.uploadedCard
      : item.partial
      ? styles.partialCard
      : {};
    return (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <TouchableOpacity
          onPress={() => handlePressCard(item)}
          style={[styles.card, isSelected && styles.selectedCard, cardStyle]} >
          <Text style={styles.soText}>SO No: {item.so}</Text>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.headerBox}>
            <Text style={styles.headerTitle}>Upload Picked SO</Text>
            {!!environment && (
              <Text style={styles.serverText}>Server: {envLabel(environment)}</Text>
            )}
          </View>

          <Text style={styles.sectionTitle}>SO Pick List</Text>

          <FlatList
            data={records}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No uploaded SOs yet</Text>
            }/>
        </View>

        <TouchableOpacity
          style={[
            styles.uploadBtn,
            (records.length === 0 || uploading) && { opacity: 0.5 },
          ]}
          disabled={records.length === 0 || uploading}
          onPress={handleUpload}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Icon name="cloud-upload" size={28} color="#fff" />
          )}
        </TouchableOpacity>

        <Modal visible={modalVisible} animationType="slide" transparent={true}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContainer}>
              <ScrollView style={styles.modalScroll}>
                <Text style={styles.modalText}>{modalContent}</Text>
              </ScrollView>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  card: { backgroundColor: '#F7F9FC', padding: 14, borderRadius: 10, marginBottom: 10 },
  selectedCard: { borderColor: '#FF9800', borderWidth: 2 },
  soText: { fontSize: 16, fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#999' },
  uploadBtn: { position: 'absolute', bottom: Platform.OS === 'android' ? 24 : 40, right: 20, backgroundColor: '#1C4D8D', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 6 },
  deleteBtn: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 80, marginVertical: 4, borderRadius: 10 },
  deleteText: { color: '#fff', fontWeight: '700', marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#fff', borderRadius: 10, maxHeight: '80%', padding: 16 },
  modalScroll: { marginBottom: 12 },
  modalText: { fontSize: 14, color: '#333' },
  modalBtn: { backgroundColor: '#1C4D8D', padding: 12, borderRadius: 8, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  uploadedCard: {
    backgroundColor: '#D4EDDA',
    borderColor: '#28A745',
    borderWidth: 1,
  },
  partialCard: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFC107',
    borderWidth: 1,
  },
});