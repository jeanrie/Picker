USE SQLITE INSTEAD OF ASYNC STORAGE. IT WILL PROBABLY HAVE THOUSAND OF DATA SO I NEED SQLITE

// DownloadSO.js (with swipe to delete)
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
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { executeQuery } from './db';

export default function DownloadSO({ navigation }) {
  const [soNumber, setSoNumber] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dbConfig, setDbConfig] = useState(null);

  // Load DB config
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

  // Fetch SO
  const fetchSO = async (soNum = '') => {
    if (!dbConfig) return;
    setLoading(true);

    try {
      const pick1Table = `[${dbConfig.mainDB}].[dbo].[PICK1]`;
      const pick2Table = `[${dbConfig.mainDB}].[dbo].[PICK2]`;
      const so1Table   = `[${dbConfig.subDB}].[dbo].[SO1]`;
      const so2Table   = `[${dbConfig.subDB}].[dbo].[SO2]`;

      // --- CHECK IF SO EXISTS IN PICK1 ---
      const pick1CheckQuery = `SELECT COUNT(*) AS cnt FROM ${pick1Table} WHERE refsono = '${soNum}'`;
      const pick1Check = await executeQuery(pick1CheckQuery);

      let isEdit = false;
      if (pick1Check?.[0]?.cnt > 0) {
        const proceed = await new Promise((resolve) => {
          Alert.alert(
            'SO Already Picked',
            'This SO has already been picked. Do you want to edit it?',
            [
              { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
              { text: 'Edit', onPress: () => resolve(true) },
            ],
            { cancelable: false }
          );
        });

        if (!proceed) {
          setLoading(false);
          return;
        }

        isEdit = true;
      }

      // --- FETCH PICK2 SERIALS FOR THIS SO ---
      const serialsQuery = `SELECT LTRIM(RTRIM(barcode)) AS barcode, serialno FROM ${pick2Table} WHERE refsono = '${soNum}'`;
      const existingSerials = (await executeQuery(serialsQuery)) || [];

      // --- FETCH SO1 HEADER ---
      const soHeadersQuery = `SELECT tseqno, customer, pono, remarks FROM ${so1Table} WHERE tseqno = '${soNum}'`;
      const soHeaders = await executeQuery(soHeadersQuery);

      // --- LOAD PREVIOUSLY SAVED SERIALS ---
      const savedRaw = await AsyncStorage.getItem('SO_SERIALS_' + soNum);
      const savedSerials = savedRaw ? JSON.parse(savedRaw) : [];

      const allRecords = [];

      for (let so of soHeaders) {
        // --- FETCH SO2 ITEMS ---
        const itemsQuery = `SELECT tseqno, barcode, [desc], qty FROM ${so2Table} WHERE tseqno = '${so.tseqno}'`;
        const items = await executeQuery(itemsQuery);

        const itemsWithSerials = items.map((item, idx) => {
          const itemBarcode = (item.barcode || '').trim().toLowerCase();

          const matchedSerials = existingSerials
            .filter(s => (s.barcode || '').trim().toLowerCase() === itemBarcode)
            .map(s => (s.serialno || '').trim())
            .filter(s => s);

          const savedItem = savedSerials.find(s => (s.barcode || '').trim().toLowerCase() === itemBarcode);
          const finalSerials = [...new Set([...(matchedSerials || []), ...(savedItem?.serials || [])])];

          return {
            ...item,
            barcode: item.barcode.trim(),
            serials: finalSerials,
            id: `${item.barcode.trim()}_${so.tseqno}_${idx}`,
          };
        });

        allRecords.push({
          id: so.tseqno.toString(),
          so: so.tseqno.toString(),
          customer: so.customer || '-',
          pono: so.pono || '-',
          remarks: so.remarks || '-',
          status: itemsWithSerials.some(i => i.serials.length > 0) ? 'IN_PROGRESS' : 'NEW',
          items: itemsWithSerials,
        });
      }

      // --- MERGE WITH SAVED DOWNLOADED SO ---
      const savedDownRaw = await AsyncStorage.getItem('DOWNLOADED_SO');
      const savedRecords = savedDownRaw ? JSON.parse(savedDownRaw) : [];

      const mergedRecords = [
        ...savedRecords.filter(r => !allRecords.some(n => n.so === r.so)),
        ...allRecords,
      ];

      setRecords(mergedRecords);
      await AsyncStorage.setItem('DOWNLOADED_SO', JSON.stringify(mergedRecords));

      // --- SUCCESS OR NOT FOUND MESSAGE ---
      if (allRecords.length === 0) {
        Alert.alert('SO Not Found', `SO number ${soNum} does not exist.`);
      } else {
        Alert.alert('Download Successful', `SO number ${soNum} has been downloaded successfully.`);
      }

    } catch (err) {
      console.log('DownloadSO error:', err);
      Alert.alert('Error', 'Failed to fetch SO from server.');
    } finally {
      setLoading(false);
    }
  };
  const handleDownload = () => fetchSO(soNumber.trim());


  const handleSelect = (item) => {
    navigation.navigate('PickSerial', { 
      screen: 'PickDetails',   // <-- nested screen
      params: {
        soNumber: item.so,
        customer: item.customer,
        soItems: item.items,   // <-- pass items WITH serials
      },
    });
  };
  const handleDelete = async (item) => {
    Alert.alert(
      'Delete SO',
      `Are you sure you want to delete SO ${item.so}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const newRecords = records.filter((r) => r.so !== item.so);
            setRecords(newRecords);
            await AsyncStorage.setItem('DOWNLOADED_SO', JSON.stringify(newRecords));
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderRightActions = (item) => (
    <TouchableOpacity
      onPress={() => handleDelete(item)}
      style={styles.deleteBtn}
    >
  
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  //onPress={() => handleSelect(item)}
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
            style={{ flex: 1 }}
            data={records}
            keyExtractor={(item) => item.id}
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
  deleteBtn: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 80, marginVertical: 4, borderRadius: 10,
  },
  deleteText: { color: '#fff', fontWeight: '700', marginTop: 2 },
});

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PickSerial from './PickSerial';
import PickDetails from './PickDetails';
import SerialsScreen from './SerialsScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const Stack = createNativeStackNavigator();

export default function PickSerialStack() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack.Navigator>
        <Stack.Screen name="PickSerial" component={PickSerial} options={{ headerShown: false }} />
        <Stack.Screen name="PickDetails" component={PickDetails} options={{ headerShown: false }} />

        <Stack.Screen name="SerialsScreen" component={SerialsScreen} options={{ headerShown: false }} />

      </Stack.Navigator>

    </GestureHandlerRootView>
  );
}


// PickSerial.js
import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PickSerial({ navigation }) {
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const swipeableRefs = useRef({});

  // Load downloaded SOs including items and status
  const loadDownloadedSO = async () => {
    try {
      const saved = await AsyncStorage.getItem('DOWNLOADED_SO');
      let list = saved ? JSON.parse(saved) : [];

      // Attach persisted status and serials for each SO
      list = await Promise.all(
        list.map(async (so, index) => {
          const status = (await AsyncStorage.getItem(`SO_STATUS_${so.so}`)) || 'NEW';
          const savedSerialsRaw = await AsyncStorage.getItem(`SO_SERIALS_${so.so}`);
          const savedSerials = savedSerialsRaw ? JSON.parse(savedSerialsRaw) : [];

          // Merge serials into items
          const itemsWithSerials = (so.items || []).map((item, idx) => {
            const barcode = (item.barcode || '').trim().toLowerCase();
            const savedItem = savedSerials.find(
              s => (s.barcode || '').trim().toLowerCase() === barcode
            );
            return {
              ...item,
              serials: savedItem?.serials || item.serials || [],
              id: item.id || `${item.barcode}_${so.so}_${idx}`,
            };
          });

          return {
            id: so.id || index.toString(),
            so: so.so || '-',
            customer: so.customer || '-',
            pono: so.pono || '-',
            remarks: so.remarks || '-',
            status,
            items: itemsWithSerials,
          };
        })
      );

      setRecords(list);
    } catch (e) {
      console.log('Failed to load downloaded SO:', e);
    }
  };

  useEffect(() => {
    loadDownloadedSO();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadDownloadedSO();
    });
    return unsubscribe;
  }, [navigation]);

  // --- FIXED: Merge serials before navigating to PickDetails ---
  const handlePress = async (item) => {
    try {
      // Load saved serials for this SO
      const savedRaw = await AsyncStorage.getItem(`SO_SERIALS_${item.so}`);
      const savedSerials = savedRaw ? JSON.parse(savedRaw) : [];

      // Merge serials for each item
      const itemsWithSerials = item.items.map((it, idx) => {
        const barcode = (it.barcode || '').trim().toLowerCase();
        const savedItem = savedSerials.find(s => (s.barcode || '').trim().toLowerCase() === barcode);

        return {
          ...it,
          serials: savedItem?.serials || it.serials || [], // <-- merge here
          id: it.id || `${it.barcode}_${item.so}_${idx}`,
        };
      });

      navigation.navigate('PickDetails', {
        soNumber: item.so,
        customer: item.customer,
        soItems: itemsWithSerials, // pass merged items
      });
    } catch (err) {
      console.log('Error preparing items for PickDetails:', err);
      Alert.alert('Error', 'Failed to load saved serials.');
    }
  };

  const handleDelete = async (itemId) => {
    Alert.alert('Delete SO', 'Are you sure you want to delete this SO?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          swipeableRefs.current[itemId]?.close();
          const updated = records.filter((r) => r.id !== itemId);
          setRecords(updated);
          await AsyncStorage.setItem('DOWNLOADED_SO', JSON.stringify(updated));
          if (selectedId === itemId) setSelectedId(null);
        },
      },
    ]);
  };

  const renderRightActions = (itemId) => (
    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(itemId)}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const getStatusColor = (status) => {
    if (status === 'DONE') return '#D1FAE5';
    if (status === 'IN_PROGRESS') return '#FEF3C7';
    return '#F7F9FC';
  };

  const renderItem = ({ item }) => (
    <Swipeable renderRightActions={() => renderRightActions(item.id)}>
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
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.container}>
          <View style={styles.headerBox}>
            <Text style={styles.headerTitle}>Pick Serial Number</Text>
          </View>

          <Text style={styles.sectionTitle}>SO Number List</Text>

          <FlatList
            data={records}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Platform.OS === 'android' ? 120 : 30 }}
            renderItem={renderItem}
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
  headerBox: { backgroundColor: '#1C4D8D', paddingVertical: 16, paddingHorizontal: 12, borderRadius: 10, marginBottom: 16 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sectionTitle: { marginBottom: 5, fontSize: 16, fontWeight: '700', color: '#1C4D8D', textAlign: 'center' },
  card: { padding: 14, borderRadius: 10, marginBottom: 10 },
  row: { flexDirection: 'row', marginTop: 6 },
  leftLabel: { width: 120, fontWeight: '600', fontSize: 14, color: '#111', marginRight: 10 },
  rightLabel: { flex: 1, fontWeight: '600', fontSize: 14, color: '#111', flexWrap: 'wrap' },
  deleteBtn: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 80, marginBottom: 10, borderRadius: 10 },
  deleteText: { color: '#fff', fontWeight: '700' },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#999' },
});

// PickDetails.js (Auto-focus ready for scanning)
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StatusBar,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';

export default function PickDetails({ navigation, route }) {
  const soNumber = route?.params?.soNumber;
  const customer = route?.params?.customer || '-';
  const initialItems = route?.params?.soItems || [];

  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [serialInput, setSerialInput] = useState('');
  const flatListRef = useRef(null);
  const serialInputRef = useRef(null);
  const tapData = useRef({});

  // Load saved records on mount
  useEffect(() => {
    const loadRecords = async () => {
      try {
        const savedSerialsRaw = await AsyncStorage.getItem(`SO_SERIALS_${soNumber}`);
        const savedSerials = savedSerialsRaw ? JSON.parse(savedSerialsRaw) : [];

        const itemsWithSerials = initialItems.map((item, idx) => {
          const savedItem = savedSerials.find((s) => s.barcode === item.barcode);

          return {
            ...item,
            id: `${item.barcode}_${idx}`,
            serials: savedItem?.serials?.length > 0
              ? savedItem.serials.map((s) => s.toUpperCase())
              : item.serials || [],
          };
        });

        setRecords(itemsWithSerials);
      } catch (err) {
        console.log('Error loading saved serials:', err);
      }
    };

    loadRecords();
  }, [soNumber, initialItems]);

  // Save serials whenever records change
  useEffect(() => {
    const saveSerials = async () => {
      try {
        await AsyncStorage.setItem(`SO_SERIALS_${soNumber}`, JSON.stringify(records));
        const status = records.every((r) => r.serials?.length >= r.qty)
          ? 'DONE'
          : records.some((r) => r.serials?.length > 0)
          ? 'IN_PROGRESS'
          : 'NEW';
        await AsyncStorage.setItem(`SO_STATUS_${soNumber}`, status);
      } catch (err) {
        console.log('Error saving serials:', err);
      }
    };
    saveSerials();
  }, [records]);

  // Always focus input when component mounts or selectedId changes
  useEffect(() => {
    setTimeout(() => {
      serialInputRef.current?.focus();
    }, 100);
  }, [selectedId]);

  // Re-focus input if keyboard disappears (common on Android)
  useEffect(() => {
    const keyboardListener = Keyboard.addListener('keyboardDidHide', () => {
      if (selectedId) {
        setTimeout(() => {
          serialInputRef.current?.focus();
        }, 50);
      }
    });

    return () => keyboardListener.remove();
  }, [selectedId]);

  const scrollToSelected = () => {
    const index = records.findIndex((r) => r.id === selectedId);
    if (index >= 0) flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
  };

  const handleAddSerial = (input) => {
    const serial = (input || serialInput).toUpperCase();
    if (!serial || !selectedId) return;

    setRecords((prev) =>
      prev.map((r) => {
        if (r.id === selectedId) {
          // Check if serial already exists
          if (r.serials?.includes(serial)) {
            Alert.alert('Duplicate Serial', `${serial} has already been scanned for ${r.desc}.`);
            return r;
          }

          // Check if max quantity reached
          if (r.serials?.length >= r.qty) {
            Alert.alert('Quantity Reached', `You have already scanned all serials for ${r.desc}.`);
            return r;
          }

          return { ...r, serials: [...(r.serials || []), serial] };
        }
        return r;
      })
    );

    setSerialInput('');
    scrollToSelected();
  };

  const handleSaveSerial = async () => {
    handleAddSerial();

    const allScanned = records.every((r) => r.serials?.length >= r.qty);

    try {
      const savedSOsRaw = await AsyncStorage.getItem('UPLOADED_SOS');
      let uploadedSOs = savedSOsRaw ? JSON.parse(savedSOsRaw) : [];

      if (allScanned) {
        if (!uploadedSOs.includes(soNumber)) uploadedSOs.push(soNumber);
      } else {
        uploadedSOs = uploadedSOs.filter((so) => so !== soNumber);
      }

      await AsyncStorage.setItem('UPLOADED_SOS', JSON.stringify(uploadedSOs));
    } catch (err) {
      console.log('Error updating UPLOADED_SOS:', err);
    }

    Alert.alert(
      allScanned ? 'All Items Scanned' : 'Incomplete Scan',
      allScanned ? 'You can upload now.' : 'Not all items scanned yet.',
      [
        {
          text: 'OK',
          onPress: () => {
            if (allScanned) navigation.navigate('UploadSO');
          },
        },
      ]
    );
  };

  const getCardColor = (item) => {
    if (!item.serials || item.serials.length === 0) return '#F7F9FC';
    if (item.serials.length < item.qty) return '#FEF3C7';
    return '#D1FAE5';
  };

  const handleDeleteItem = (item) => {
    Alert.alert('Delete Item', `Are you sure you want to delete ${item.desc}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const newRecords = records.filter((r) => r.id !== item.id);
          setRecords(newRecords);
          await AsyncStorage.setItem(`SO_SERIALS_${soNumber}`, JSON.stringify(newRecords));
        },
      },
    ]);
  };

  const renderRightActions = (item) => (
    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteItem(item)}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => {
    const isSelected = selectedId === item.id;
    const backgroundColor = getCardColor(item);

    const handlePress = () => {
      const id = item.id;
      if (!tapData.current[id]) tapData.current[id] = { count: 0, timeout: null };
      tapData.current[id].count += 1;

      if (tapData.current[id].timeout) clearTimeout(tapData.current[id].timeout);

      tapData.current[id].timeout = setTimeout(() => {
        const count = tapData.current[id].count;

        if (count === 1) {
          setSelectedId(id); // just select item
        } else if (count === 2) {
          Alert.alert(`Clear Serials`, `Clear all serials for ${item.desc}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes',
              style: 'destructive',
              onPress: () =>
                setRecords((prev) =>
                  prev.map((r) => (r.id === id ? { ...r, serials: [] } : r))
                ),
            },
          ]);
        } else if (count >= 3) {
          navigation.navigate('SerialsScreen', {
            item,
            onDeleteSerial: (deletedIndex) => {
              setRecords((prevRecords) =>
                prevRecords.map((r) =>
                  r.id === item.id
                    ? { ...r, serials: r.serials.filter((_, i) => i !== deletedIndex) }
                    : r
                )
              );
            },
          });
        }

        tapData.current[id].count = 0;
        tapData.current[id].timeout = null;
      }, 400);
    };

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <TouchableOpacity
          style={[
            styles.card,
            { backgroundColor, borderColor: isSelected ? '#FFA500' : 'transparent', borderWidth: isSelected ? 3 : 0 },
          ]}
          onPress={handlePress}
          activeOpacity={0.8}
        >
          <Text style={styles.descText}>{item.desc}</Text>
          <Text style={styles.qtyText}>Qty: {item.qty}</Text>
          <Text style={styles.pickText}>Pick List</Text>

          {isSelected && (
            <View style={styles.serialList}>
              {item.serials && item.serials.length > 0 ? (
                <ScrollView style={{ maxHeight: 120 }} contentContainerStyle={{ flexGrow: 0 }} nestedScrollEnabled>
                  {[...item.serials].reverse().map((s, i) => (
                    <Text key={i} style={styles.serialText}>
                      {s}
                    </Text>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.emptySerialText}>No serials scanned yet</Text>
              )}
            </View>
          )}
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <SafeAreaView style={styles.safe}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnTop}>
              <Icon name="arrow-back" size={20} color="#1C4D8D" />
            </TouchableOpacity>

            <View style={styles.headerBox}>
              <Text style={styles.headerTitle}>SO Number: {soNumber}</Text>
              <Text style={styles.subTitle}>{customer}</Text>
            </View>

            <Text style={styles.sectionTitle}>Item List</Text>

            <FlatList
              ref={flatListRef}
              data={records}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 160 }}
            />

            <View style={styles.inputRowWrapper}>
              <View style={styles.inputRow}>
                <TextInput
                  ref={serialInputRef}
                  style={styles.input}
                  placeholder="Enter/Scan serial number"
                  value={serialInput}
                  onChangeText={setSerialInput}
                  onSubmitEditing={(e) => {
                    const scannedValue = e.nativeEvent.text?.trim();
                    if (scannedValue && selectedId) handleAddSerial(scannedValue);
                  }}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  autoFocus={true}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSerial}>
                  <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 8 : 0 },
  backBtnTop: { marginTop: 12, marginLeft: 16, marginBottom: 8 },
  headerBox: { backgroundColor: '#1C4D8D', paddingVertical: 16, paddingHorizontal: 12, borderRadius: 10, marginHorizontal: 16, marginBottom: 16, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 5 },
  subTitle: { color: '#fff', fontSize: 14, fontWeight: '300' },
  sectionTitle: { marginBottom: 5, fontSize: 16, fontWeight: '700', color: '#1C4D8D', textAlign: 'center' },
  card: { padding: 14, borderRadius: 10, marginBottom: 10, marginHorizontal: 16 },
  descText: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 4 },
  qtyText: { fontSize: 14, color: '#111', marginBottom: 2 },
  pickText: { fontSize: 14, color: '#2563EB' },
  serialList: { marginTop: 2, maxHeight: 120, paddingTop: 6 },
  serialText: { fontSize: 14, color: '#000', marginBottom: 4, paddingLeft: 10 },
  emptySerialText: { fontSize: 14, color: '#999', fontStyle: 'italic' },
  inputRowWrapper: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#fff' },
  inputRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  input: { flex: 1, backgroundColor: '#F2F2F2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  saveBtn: { backgroundColor: '#1C4D8D', paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', marginLeft: 8, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 80, marginVertical: 4, borderRadius: 10 },
  deleteText: { color: '#fff', fontWeight: '700', marginTop: 2 },
});

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UploadSO from './UploadSO';
import UploadPickSO from './UploadPickSO';

const Stack = createNativeStackNavigator();

export default function PickSerialStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="UploadSO" 
        component={UploadSO} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="UploadPickSO" 
        component={UploadPickSO} 
        options={{ headerShown: false }} 
      />
    </Stack.Navigator>
  );
}

// UploadSO.js (Fixed: dynamic pickby based on logged-in user)
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
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { executeQuery, executeNonQuery } from './db';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';

export default function UploadSO({ navigation }) {
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState('');

  // Load uploaded SOs
  const loadSOs = async () => {
    try {
      const savedSOs = await AsyncStorage.getItem('UPLOADED_SOS');
      const soList = savedSOs ? JSON.parse(savedSOs) : [];
      const formatted = soList.map((so, idx) => ({ id: `${idx}`, so }));
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
    navigation.navigate('UploadPickSO', { soNumber: item.so });
  };

  const getNextRefId = async () => {
    const yearPrefix = new Date().getFullYear() % 100;
    const rows = await executeQuery(
      `SELECT ISNULL(MAX(refid), ${yearPrefix}00000) + 1 AS nextRefId 
       FROM PICK1 WHERE refid LIKE '${yearPrefix}%'`
    );
    return rows[0].nextRefId;
  };

 
  const uploadPickSO = async (soNumber) => {
    try {

      const loggedRaw = await AsyncStorage.getItem('LOGGED_IN_USER');
      if (!loggedRaw) throw new Error('No logged-in user found. Please login again.');
      const loggedUser = JSON.parse(loggedRaw);
      const empId = Number(loggedUser.user || loggedUser.ID);
      if (!empId) throw new Error('Invalid user ID');

   
      const savedSerialsRaw = await AsyncStorage.getItem(`SO_SERIALS_${soNumber}`);
      const savedSerials = savedSerialsRaw ? JSON.parse(savedSerialsRaw) : [];
      const failedSerials = [];

      if (!savedSerials.length) {
        return {
          soNumber,
          success: false,
          failedSerials: [{ desc: '-', serial: '-', reason: 'No serials scanned' }],
        };
      }

    
      for (const item of savedSerials) {
        const serials = Array.isArray(item.serials) ? item.serials : [];

        // Case: no serials under this item
        if (serials.length === 0) {
          failedSerials.push({
            desc: item.desc || '-',
            serial: '-',
            reason: 'Serial not found',
          });
        }

        // Check each scanned serial
        for (const serial of serials) {
          const cleanSerial = String(serial).replace(/'/g, "''");
          const barcode = String(item.barcode || '').replace(/'/g, "''");

          // Check if serial exists in master table
          const existsInMaster = await executeQuery(
            `SELECT TOP 1 serialno FROM serial WHERE barcode='${barcode}' AND serialno='${cleanSerial}'`
          );
          if (existsInMaster.length === 0) {
            failedSerials.push({
              desc: item.desc || '-',
              serial: serial,
              reason: 'Serial not found',
            });
            continue; 
          }

          // Check if serial already picked
          const dup = await executeQuery(
            `SELECT TOP 1 serialno FROM PICK2 WHERE serialno = '${cleanSerial}'`
          );
          if (dup.length > 0) {
            failedSerials.push({
              desc: item.desc || '-',
              serial: serial,
              reason: 'Serial already picked',
            });
          }
        }
      }

      // If any failed serials, stop upload
      if (failedSerials.length) {
        return { soNumber, success: false, failedSerials };
      }

   
      await executeNonQuery(`DELETE FROM PICK2 WHERE refsono = '${soNumber}'`);
      await executeNonQuery(`DELETE FROM PICK1 WHERE refsono = '${soNumber}'`);

      const refId = await getNextRefId();
      const soInt = parseInt(soNumber, 10);

   
      await executeNonQuery(
        `INSERT INTO PICK1 (refid, refsono, date, ispickonline) 
        VALUES (${refId}, ${soInt}, GETDATE(), NULL)`
      );

     
      // INSERT PICK2 SERIALS
      
      for (const item of savedSerials) {
        const barcode = String(item.barcode || '').replace(/'/g, "''");
        const serials = Array.isArray(item.serials) ? item.serials : [];

        for (const serial of serials) {
          const cleanSerial = String(serial).replace(/'/g, "''");

      
          const existsInMaster = await executeQuery(
            `SELECT TOP 1 serialno FROM serial WHERE barcode='${barcode}' AND serialno='${cleanSerial}'`
          );
          if (existsInMaster.length === 0) continue;

          await executeNonQuery(
            `INSERT INTO PICK2 
            (refid, refsono, barcode, serialno, pickby, date, ispickonline, isdone)
            VALUES (${refId}, ${soInt}, '${barcode}', '${cleanSerial}', ${empId}, GETDATE(), NULL, NULL)`
          );
        }
      }

  
      await AsyncStorage.removeItem(`SO_SERIALS_${soNumber}`);

      return { soNumber, success: true, savedSerials };
    } catch (err) {
      console.log('UPLOAD FAILED:', err);
      return {
        soNumber,
        success: false,
        failedSerials: [{ desc: '-', serial: '-', reason: err.message }],
      };
    }
  };


  const handleUpload = async () => {
    if (!records.length) return;
    setUploading(true);

    const failedUploads = [];
    const successUploads = [];
    const recordsCopy = [...records];

    for (const r of recordsCopy) {
      const result = await uploadPickSO(r.so); 
      if (result.success) {
        successUploads.push(result);

     
        setRecords(prev => prev.filter(rec => rec.so !== r.so));

        const uploadedRaw = await AsyncStorage.getItem('UPLOADED_SOS');
        const uploaded = uploadedRaw ? JSON.parse(uploadedRaw) : [];
        const updatedUploaded = uploaded.filter(so => so !== r.so);
        await AsyncStorage.setItem('UPLOADED_SOS', JSON.stringify(updatedUploaded));

   
        const downloadedRaw = await AsyncStorage.getItem('DOWNLOADED_SO');
        const downloaded = downloadedRaw ? JSON.parse(downloadedRaw) : [];
        const updatedDownloaded = downloaded.filter(so => so.so !== r.so);
        await AsyncStorage.setItem('DOWNLOADED_SO', JSON.stringify(updatedDownloaded));
      } else {
        failedUploads.push(result);
      }
    }

    setUploading(false);

    let modalMsg = '';

    if (successUploads.length) {
      const successMsg = successUploads
        .map(s =>
          s.savedSerials
            .map(item =>
              item.serials
                .map(
                  serial =>
                    `SO No: ${s.soNumber}\nDescription: ${item.desc}\nSerial no: ${serial}`
                )
                .join('\n\n')
            )
            .join('\n\n')
        )
        .join('\n\n');
      modalMsg += `✅ Successes:\n${successMsg}\n\n`;
    }

    if (failedUploads.length) {
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
  };

  // ----------------------- DELETE FUNCTION -----------------------
  const handleDelete = async (item) => {
    const newRecords = records.filter(r => r.so !== item.so);
    setRecords(newRecords);
    await AsyncStorage.setItem(
      'UPLOADED_SOS',
      JSON.stringify(newRecords.map(r => r.so))
    );
  };

  const renderRightActions = (item) => (
    <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => {
    const isSelected = selectedId === item.id;
    return (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <TouchableOpacity
          onPress={() => handlePressCard(item)}
          style={[styles.card, isSelected && styles.selectedCard]}
        >
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
          </View>

          <Text style={styles.sectionTitle}>SO Pick List</Text>

          <FlatList
            data={records}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No uploaded SOs yet</Text>
            }
          />
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
});
//UploadPickSO
import React, { useEffect, useRef, useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  SafeAreaView, 
  Platform, 
  StatusBar, 
  TouchableOpacity, 
  StyleSheet 
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function UploadPickSO({ route, navigation }) {
  const { soNumber, customer = '-', soItems = [] } = route.params || {};
  const [records, setRecords] = useState([]);
  const flatListRef = useRef(null);

  useEffect(() => {
    const loadRecords = async () => {
      try {
        const savedSerials = await AsyncStorage.getItem(`SO_SERIALS_${soNumber}`);
        if (!savedSerials) {
          setRecords([]);
          return;
        }
        const saved = JSON.parse(savedSerials);

        // If may soItems → merge
        if (soItems.length > 0) {
          const merged = soItems.map((item, idx) => {
            const savedItem = saved.find((s) => s.barcode === item.barcode);
            return {
              ...item,
              id: `${item.barcode}_${idx}`,
              serials: savedItem?.serials || [],
            };
          });
          setRecords(merged);
        } 
        // If walang soItems → gamitin saved data directly
        else {
          const normalized = saved.map((item, idx) => ({
            ...item,
            id: `${item.barcode}_${idx}`,
            desc: item.desc || item.item || 'Item',
            qty: item.qty || item.serials?.length || 0,
            serials: item.serials || [],
          }));
          setRecords(normalized);
        }
      } catch (e) {
        console.log('Error loading SO serials:', e);
      }
    };

    if (soNumber) loadRecords();
  }, [soNumber, soItems]);

  const renderItem = ({ item }) => {
    return (
      <View style={styles.card}>
        <Text style={styles.descText}>{item.desc}</Text>
        <Text style={styles.qtyText}>Qty: {item.qty}</Text>
        {item.barcode ? (
          <Text style={styles.barcodeText}>{item.barcode}</Text>
        ) : null}
        <Text style={styles.pickText}>PICK LIST</Text>
        <View style={styles.serialList}>
          {item.serials?.length > 0 ? (
            item.serials.map((s, i) => (
              <Text key={`${item.id}_${i}`} style={styles.serialText}>
                {s}
              </Text>
            ))
          ) : (
            <Text style={styles.emptySerialText}>No serials scanned</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnTop}>
        <Icon name="arrow-back" size={20} color="#1C4D8D" />
      </TouchableOpacity>

      <View style={styles.headerBox}>
        <Text style={styles.headerTitle}>SO No: {soNumber}</Text>
      </View>

      <Text style={styles.sectionTitle}>SO Item List</Text>

      <FlatList
        ref={flatListRef}
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No saved items for this SO</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 8 : 0,
  },
  backBtnTop: {
    marginTop: 12,
    marginLeft: 16,
    marginBottom: 8,
  },
  headerBox: {
    backgroundColor: '#1C4D8D',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  sectionTitle: {
    marginBottom: 6,
    fontSize: 16,
    fontWeight: '700',
    color: '#1C4D8D',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#F7F9FC',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  descText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  qtyText: {
    fontSize: 14,
  },
  barcodeText: {
    fontSize: 14,
    color: '#2563EB',
    marginBottom: 4,
  },
  pickText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 6,
  },
  serialList: {
    marginTop: 6,
    paddingLeft: 10,
  },
  serialText: {
    fontSize: 14,
    color: '#000',
    marginBottom: 4,
  },
  emptySerialText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#999',
  },
});

//Login.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { executeQuery } from './db';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Login({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Missing fields', 'Please enter username and password.');
      return;
    }

    try {
      setLoading(true);

      const cleanUser = String(username).trim().replace(/'/g, "''");
      const cleanPass = String(password).trim().replace(/'/g, "''");

      const rows = await executeQuery(`
        EXEC dbo.PasswordCheck 
          @Username = '${cleanUser}', 
          @Password = '${cleanPass}'
      `);

      if (!rows.length) {
        Alert.alert('Login failed', 'Invalid username/password or inactive account.');
        return;
      }

      const user = rows[0];
      // ✅ Make sure 'user' field exists for PICK2
      if (!user.user && user.ID) user.user = user.ID;

      await AsyncStorage.setItem('LOGGED_IN_USER', JSON.stringify(user));
      navigation.replace('Tabs');

    } catch (err) {
      console.log('Login error:', err);
      Alert.alert('Connection Error', err?.message || 'Unable to connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigureSettings = () => {
    navigation.navigate('Settings');
  };

  const screenWidth = Dimensions.get('window').width;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.title}>SFS PICKER</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <TextInput
          placeholder="Enter Username"
          placeholderTextColor="#666"
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          value={username}
          onChangeText={(text) => setUsername(text.toUpperCase())} 
          editable={!loading}
        />

        <TextInput
          placeholder="Enter Password"
          placeholderTextColor="#666"
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.7 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleConfigureSettings} disabled={loading}>
          <Text style={styles.settingsLink}>Configure Settings</Text>
        </TouchableOpacity>

        <Image
          source={require('./assets/aircon.png')}
          style={[styles.logo, { width: screenWidth * 0.3, height: screenWidth * 0.3 }]}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 36, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 16, color: '#555', textAlign: 'center', marginBottom: 32 },
  input: { backgroundColor: '#f2f2f2', borderRadius: 10, padding: 15, color: '#111', fontSize: 16, marginBottom: 16 },
  button: { backgroundColor: '#1C4D8D', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  settingsLink: { marginTop: 20, color: '#0046FF', textAlign: 'center', fontSize: 18 },
  logo: { resizeMode: 'contain', marginTop: 30, alignSelf: 'center' },
});

serialscreen.js
import React, { useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  SafeAreaView, 
  Alert, 
  Platform, 
  StatusBar,
  TouchableOpacity 
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/Ionicons';


export default function SerialsScreen({ navigation, route }) {
  const { item, onDeleteSerial } = route.params;
  const [serials, setSerials] = useState(item.serials);
  

  const handleDelete = (index) => {
    Alert.alert(
      'Delete Serial',
      `Are you sure you want to delete serial [${serials[index]}]?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: () => {
            const newSerials = [...serials];
            newSerials.splice(index, 1);
            setSerials(newSerials);

            // Update PickDetails immediately
            if (onDeleteSerial) onDeleteSerial(index);
          } 
        }
      ]
    );
  };

  const renderRightActions = (index) => (
    <TouchableOpacity 
      style={styles.deleteBtn} 
      onPress={() => handleDelete(index)}
    >
   
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item: serial, index }) => (
    <Swipeable renderRightActions={() => renderRightActions(index)}>
      <View style={styles.serialCard}>
        <Text style={styles.serialText}>{serial}</Text>
      </View>
    </Swipeable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtnTop}>
        <Icon name="arrow-back" size={20} color="#1C4D8D" />
      </TouchableOpacity>

      <View style={styles.headerBox}>
        <Text style={styles.headerTitle}>Serial Numbers</Text>
      </View>

      {serials.length > 0 ? (
        <FlatList
          data={serials}
          keyExtractor={(s, i) => i.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
        />
      ) : (
        <View style={{ padding: 16 }}>
          <Text style={styles.emptyText}>No serials scanned yet</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 8 : 0 },
  backBtnTop: { marginTop: 12, marginLeft: 16, marginBottom: 8 },
  headerBox: { backgroundColor: '#1C4D8D', paddingVertical: 16, paddingHorizontal: 12, borderRadius: 10, marginHorizontal: 16, marginBottom: 16, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  serialCard: { padding: 12, marginBottom: 10, backgroundColor: '#F2F2F2', borderRadius: 8 },
  serialText: { fontSize: 16, fontWeight: '600' },
  emptyText: { fontSize: 16, fontStyle: 'italic', color: '#999' },
  deleteBtn: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 80, borderRadius: 8, marginBottom: 10, marginLeft: 10 },
  deleteText: { color: '#fff', fontWeight: '700', marginTop: 2 },
});

//SettingsScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MSSQL from 'react-native-mssql';

export default function SettingsScreen({ navigation }) {
  const [serverName, setServerName] = useState('');
  const [mainDB, setMainDB] = useState('');
  const [subDB, setSubDB] = useState('');
  const [serverUser, setServerUser] = useState('');
  const [serverPass, setServerPass] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('SERVER_CONFIG');
        if (saved) {
          const config = JSON.parse(saved);
          setServerName(config.serverName || '');
          setMainDB(config.mainDB || '');
          setSubDB(config.subDB || '');
          setServerUser(config.serverUser || '');
          setServerPass(config.serverPass || '');
        }
      } catch (err) {
        console.log('Failed to load config:', err);
      }
    })();
  }, []);

  // ✅ Test MSSQL then Save
  const testAndSave = async () => {
    if (!serverName || !mainDB || !serverUser || !serverPass) {
      Alert.alert('Missing Info', 'Fill up all required fields.');
      return;
    }

    setLoading(true);

    const config = {
      server: serverName,
      username: serverUser,
      password: serverPass,
      database: mainDB,
      port: 1433,
      timeout: 10,
    };

    try {
      await MSSQL.connect(config);
      const result = await MSSQL.executeQuery('SELECT 1 AS test');

      if (result && result.length > 0) {
        const saveObj = { serverName, mainDB, subDB, serverUser, serverPass };
        await AsyncStorage.setItem('SERVER_CONFIG', JSON.stringify(saveObj));

        Alert.alert('✅ Success', 'Connected to SQL Server and saved!');
        navigation.goBack();
      } else {
        Alert.alert('⚠️ Failed', 'Connected but query failed.');
      }
    } catch (err) {
      console.log('MSSQL error:', err);
      Alert.alert('❌ Connection Failed', 'Cannot connect to SQL Server.');
    } finally {
      try { await MSSQL.close(); } catch {}
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Server Settings</Text>

        <View style={styles.formContainer}>
          <Field label="Server Name / IP" value={serverName} onChangeText={setServerName} />
          <Field label="Main Database" value={mainDB} onChangeText={setMainDB} />
          <Field label="Sub Database" value={subDB} onChangeText={setSubDB} />
          <Field label="Username" value={serverUser} onChangeText={setServerUser} />
          <Field label="Password" value={serverPass} onChangeText={setServerPass} secureTextEntry />
        </View>

        <TouchableOpacity style={styles.button} onPress={testAndSave} disabled={loading}>
          <Text style={styles.buttonText}>
            {loading ? 'Testing connection...' : 'Test & Save'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#ccc' }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.buttonText, { color: '#111' }]}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={label}
        placeholderTextColor="#666"
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 20, paddingBottom: 60, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },

  formContainer: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    elevation: 4,
    marginBottom: 16,
  },

  inputGroup: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111',
  },

  button: {
    width: '100%',
    backgroundColor: '#1A2A4F',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },

  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, Dimensions, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Account({ navigation }) {
  const [user, setUser] = useState({ name: '' });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const loggedInUser = await AsyncStorage.getItem('LOGGED_IN_USER');
        if (!loggedInUser) return;

        const userObj = JSON.parse(loggedInUser);

        setUser({
          name: userObj.name || userObj.Username || userObj.longname || '',
        });
      } catch (error) {
        console.log('Failed to load user:', error);
      }
    };

    loadUser();
  }, []);

  const confirmLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: handleLogout },
      ],
      { cancelable: true }
    );
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('LOGGED_IN_USER');
      navigation.replace('Login');
    } catch (error) {
      Alert.alert('Error', 'Failed to logout. Please try again.');
      console.log(error);
    }
  };

  const screenWidth = Dimensions.get('window').width;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <Text style={styles.title}>SFS Picker</Text>
          <Image
            source={require('./assets/aircon.png')} // replace with your logo path
            style={[styles.logo, { width: screenWidth * 0.40, height: screenWidth * 0.40 }]}
          />
        </View>

        {/* User Info and Logout */}
        <View style={styles.body}>
          <Text style={styles.name}>{user.name}</Text>
          <TouchableOpacity style={styles.button} onPress={confirmLogout}>
            <Text style={styles.buttonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, padding: 24 },
  header: { alignItems: 'center', marginTop: 20, marginBottom: 30 },
  title: { fontSize: 40, fontWeight: '700', color: '#1C4D8D', marginTop: 30 },
  logo: { resizeMode: 'contain', marginBottom: 30 },
  body: { alignItems: 'center' },
  name: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#111' },
  button: {
    backgroundColor: '#396092',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});

// Dashboard.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Dashboard() {
  const [name, setName] = useState('');
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    const loadUser = async () => {
      try {
        const loggedInUser = await AsyncStorage.getItem('LOGGED_IN_USER');
        if (!loggedInUser) return;

        const userObj = JSON.parse(loggedInUser);
        setName(userObj.name || userObj.Username || userObj.longname || '');
      } catch (error) {
        console.log('Failed to load user:', error);
      }
    };

    loadUser();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Logo at the top */}
        <Image
          source={require('./assets/picker.png')} // replace with your logo path
          style={[styles.logo, { width: screenWidth * 0.4, height: screenWidth * 0.4 }]}
        />

        <Text style={styles.text}>
          Welcome {name}!{'\n'}You're now in SFS Picker
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  logo: { resizeMode: 'contain', marginBottom: 50 },
  text: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
});