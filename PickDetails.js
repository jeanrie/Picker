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
  const autoSelected = useRef(false);

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
            desc: item.desc || item.description || item.item_desc || 'No Description',
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

  // Auto-select first incomplete item
  useEffect(() => {
    if (records.length === 0 || autoSelected.current) return;

    const firstIncomplete = records.find(r => (r.serials?.length || 0) < r.qty);

    if (firstIncomplete) {
      autoSelected.current = true;
      setSelectedId(firstIncomplete.id);

      setTimeout(() => {
        const index = records.findIndex(r => r.id === firstIncomplete.id);
        flatListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.3,
        });
      }, 200);
    }
  }, [records]);

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
    if (index >= 0)
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
  };

  const resetUploadStatus = async () => {
    try {
      // Remove from SUCCESS_UPLOADED_SOS
      const uploadedRaw = await AsyncStorage.getItem('SUCCESS_UPLOADED_SOS');
      let uploaded = uploadedRaw ? JSON.parse(uploadedRaw) : [];
      uploaded = uploaded.filter(so => so !== soNumber);
      await AsyncStorage.setItem('SUCCESS_UPLOADED_SOS', JSON.stringify(uploaded));

      // Ensure in UPLOADED_SOS list
      const savedRaw = await AsyncStorage.getItem('UPLOADED_SOS');
      let saved = savedRaw ? JSON.parse(savedRaw) : [];
      if (!saved.includes(soNumber)) {
        saved.push(soNumber);
        await AsyncStorage.setItem('UPLOADED_SOS', JSON.stringify(saved));
      }
    } catch (err) {
      console.log('Reset upload status error:', err);
    }
  };

  const handleAddSerial = (input) => {
    const serial = (input || serialInput).toUpperCase();
    if (!serial || !selectedId) return;

    resetUploadStatus();

    setRecords((prev) => {
      const updated = prev.map((r) => {
        if (r.id === selectedId) {
          if (r.serials?.includes(serial)) {
            Alert.alert('Duplicate Serial', `${serial} has already been scanned for ${r.desc}.`);
            return r;
          }
          if (r.serials?.length >= r.qty) {
            Alert.alert('Quantity Reached', `You have already scanned all serials for ${r.desc}.`);
            return r;
          }
          return { ...r, serials: [...(r.serials || []), serial] };
        }
        return r;
      });

      // Auto-select next incomplete item
      const currentIndex = updated.findIndex(r => r.id === selectedId);
      const currentItem = updated[currentIndex];

      if (currentItem && currentItem.serials.length >= currentItem.qty) {
        const nextItem = updated.find(
          (r, i) => i > currentIndex && (r.serials?.length || 0) < r.qty
        );

        if (nextItem) {
          const nextIndex = updated.findIndex(r => r.id === nextItem.id);
          setTimeout(() => {
            setSelectedId(nextItem.id);
            flatListRef.current?.scrollToIndex({
              index: nextIndex,
              animated: true,
              viewPosition: 0.3,
            });
          }, 200);
        }
      }

      return updated;
    });

    setSerialInput('');
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
    Alert.alert(`Delete Item`, `Are you sure you want to delete ${item.desc}?`, [
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

      // Initialize tap tracking
      if (!tapData.current[id]) tapData.current[id] = { count: 0, timeout: null };
      tapData.current[id].count += 1;

      if (tapData.current[id].timeout) clearTimeout(tapData.current[id].timeout);

      tapData.current[id].timeout = setTimeout(() => {
        const count = tapData.current[id].count;

        if (count === 1) {
          // Single tap → select item
          setSelectedId(id);
          scrollToSelected();

          // Keep keyboard focused
          setTimeout(() => serialInputRef.current?.focus(), 50);

        } else if (count === 2) {
          // Double tap → clear serials
          Alert.alert(`Clear Serials`, `Clear all serials for ${item.desc}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes',
              style: 'destructive',
              onPress: () => {
                setRecords(prev =>
                  prev.map(r => (r.id === id ? { ...r, serials: [] } : r))
                );

                setSelectedId(id);
                scrollToSelected();

                // Keep keyboard focused
                setTimeout(() => serialInputRef.current?.focus(), 50);
              },
            },
          ]);

        } else if (count >= 3) {
          // Triple tap → navigate to serials screen
          navigation.navigate('SerialsScreen', {
            item,
            onDeleteSerial: (deletedIndex) => {
              resetUploadStatus();
              setRecords(prev =>
                prev.map(r =>
                  r.id === item.id
                    ? { ...r, serials: r.serials.filter((_, i) => i !== deletedIndex) }
                    : r
                )
              );
            },
          });
        }

        // Reset tap tracking
        tapData.current[id].count = 0;
        tapData.current[id].timeout = null;
      }, 350); // 350ms double-tap window
    };

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <TouchableOpacity
          style={[
            styles.card,
            {
              backgroundColor,
              borderColor: isSelected ? '#FFA500' : 'transparent',
              borderWidth: isSelected ? 3 : 0,
            },
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
                <ScrollView
                  style={{ maxHeight: 120 }}
                  contentContainerStyle={{ flexGrow: 0 }}
                  nestedScrollEnabled
                >
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
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 160 }}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
                }, 300);
              }}
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