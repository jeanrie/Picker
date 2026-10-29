// PickDetails.js 
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  Keyboard,
  Platform,
  StatusBar,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  PermissionsAndroid,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { launchCamera } from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { getCurrentEnvironment, soKey, envListKey } from './Soenv';


const SERIAL_PATTERN = /^[A-Z0-9\-]{8,25}$/;

function extractSerialCandidate(rawText) {
  if (!rawText) return null;

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);


  for (const line of lines) {
    const cleaned = line.replace(/\s+/g, '').toUpperCase();
    if (SERIAL_PATTERN.test(cleaned)) {
      return cleaned;
    }
  }


  const tokens = rawText.match(/[A-Z0-9\-]{8,25}/gi);
  if (tokens && tokens.length > 0) {
    return tokens.sort((a, b) => b.length - a.length)[0].toUpperCase();
  }

  return null;
}

export default function PickDetails({ navigation, route }) {

  const soNumber = route?.params?.soNumber;
  const customer = route?.params?.customer || '-';
  const initialItems = route?.params?.soItems || [];

  // Environment comes from PickSerial/DownloadSO
  const [environment, setEnvironment] = useState(route?.params?.environment || null);

  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [serialInput, setSerialInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const flatListRef = useRef(null);
  const serialInputRef = useRef(null);
  const tapData = useRef({});
  const autoSelected = useRef(false);
  const loadedRef = useRef(false); // prevents overwriting saved serials before load finishes

  useEffect(() => {
    if (environment) return;
    getCurrentEnvironment().then(setEnvironment);
  }, [environment]);

 
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Load saved records on mount
  useEffect(() => {
    if (!environment) return;

    loadedRef.current = false;

    const loadRecords = async () => {
      try {
        const savedSerialsRaw = await AsyncStorage.getItem(
          soKey('SO_SERIALS', environment, soNumber)
        );
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
        loadedRef.current = true;
      } catch (err) {
        console.log('Error loading saved serials:', err);
      }
    };

    loadRecords();
  }, [soNumber, initialItems, environment]);

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

  // Save serials whenever records change (only after initial load)
  useEffect(() => {
    if (!environment || !loadedRef.current) return;

    const saveSerials = async () => {
      try {
        await AsyncStorage.setItem(
          soKey('SO_SERIALS', environment, soNumber),
          JSON.stringify(records)
        );

        const status = records.every((r) => r.serials?.length >= r.qty)
          ? 'DONE'
          : records.some((r) => r.serials?.length > 0)
          ? 'IN_PROGRESS'
          : 'NEW';

        await AsyncStorage.setItem(soKey('SO_STATUS', environment, soNumber), status);
      } catch (err) {
        console.log('Error saving serials:', err);
      }
    };
    saveSerials();
  }, [records, environment]);

  
  useEffect(() => {
    setTimeout(() => {
      serialInputRef.current?.focus();
    }, 100);
  }, [selectedId]);


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
    if (!environment) return;
    try {
      // Remove from SUCCESS_UPLOADED_SOS (this environment)
      const successKey = envListKey('SUCCESS_UPLOADED_SOS', environment);
      const uploadedRaw = await AsyncStorage.getItem(successKey);
      let uploaded = uploadedRaw ? JSON.parse(uploadedRaw) : [];
      uploaded = uploaded.filter(so => so !== soNumber);
      await AsyncStorage.setItem(successKey, JSON.stringify(uploaded));

      // Ensure in UPLOADED_SOS list (this environment)
      const listKey = envListKey('UPLOADED_SOS', environment);
      const savedRaw = await AsyncStorage.getItem(listKey);
      let saved = savedRaw ? JSON.parse(savedRaw) : [];
      if (!saved.includes(soNumber)) {
        saved.push(soNumber);
        await AsyncStorage.setItem(listKey, JSON.stringify(saved));
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

  //OCR: capture photo 
  const requestCameraPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const alreadyGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CAMERA
      );
      if (alreadyGranted) return true;

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message: 'Kailangan ng camera access para i-scan ang serial number.',
          buttonPositive: 'OK',
          buttonNegative: 'Cancel',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.log('Camera permission error:', err);
      return false;
    }
  };

  const handleScanSerial = async () => {
    if (!selectedId) {
      Alert.alert('Select Item', 'Please select an item first before scanning.');
      return;
    }

    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert(
        'Camera Permission Needed',
        'I-enable ang Camera permission ng app sa Settings para makapag-scan.'
      );
      return;
    }

    let result;
    try {
      result = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        saveToPhotos: false,
        cameraType: 'back',
      });
    } catch (err) {
      console.log('launchCamera error:', err);
      Alert.alert('Camera Error', 'Hindi mabuksan ang camera. Subukan ulit.');
      return;
    }

    if (result.errorCode) {
      console.log('launchCamera errorCode:', result.errorCode, result.errorMessage);
      Alert.alert('Camera Error', result.errorMessage || `Error: ${result.errorCode}`);
      return;
    }

    if (result.didCancel || !result.assets?.length) return;

    const uri = result.assets[0].uri;
    setScanning(true);

    try {
      const ocrResult = await TextRecognition.recognize(uri);
      const rawText = ocrResult?.text || '';
      const candidate = extractSerialCandidate(rawText);

      if (!candidate) {
        Alert.alert(
          'No Serial Detected',
          `Walang nabasang valid serial sa picture. Detected text:\n\n${rawText || '(wala)'}`,
          [
            { text: 'Retake', onPress: handleScanSerial },
            { text: 'Type Manually', style: 'cancel' },
          ]
        );
        return;
      }

      Alert.alert(
        'Confirm Serial',
        `Detected: ${candidate}`,
        [
          { text: 'Retake', onPress: handleScanSerial },
          {
            text: 'Edit',
            onPress: () => {
              setSerialInput(candidate);
              setTimeout(() => serialInputRef.current?.focus(), 100);
            },
          },
          { text: 'Confirm', onPress: () => handleAddSerial(candidate) },
        ]
      );
    } catch (err) {
      console.log('OCR error:', err);
      Alert.alert('Scan Error', 'Failed to scan serial number. Please try again or type it manually.');
    } finally {
      setScanning(false);
    }
  };

  const handleSaveSerial = async () => {
    handleAddSerial();

    const allScanned = records.every((r) => r.serials?.length >= r.qty);

    try {
      const listKey = envListKey('UPLOADED_SOS', environment);
      const savedSOsRaw = await AsyncStorage.getItem(listKey);
      let uploadedSOs = savedSOsRaw ? JSON.parse(savedSOsRaw) : [];

      if (allScanned) {
        if (!uploadedSOs.includes(soNumber)) uploadedSOs.push(soNumber);
      } else {
        uploadedSOs = uploadedSOs.filter((so) => so !== soNumber);
      }

      await AsyncStorage.setItem(listKey, JSON.stringify(uploadedSOs));
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
          await AsyncStorage.setItem(
            soKey('SO_SERIALS', environment, soNumber),
            JSON.stringify(newRecords)
          );
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
        
          setSelectedId(id);
          scrollToSelected();

         
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
      }, 350); 
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
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtnTop}
          >
            <Icon name="arrow-back" size={20} color="#1C4D8D" />
          </TouchableOpacity>

          <View style={styles.headerBox}>
            <Text style={styles.headerTitle}>SO Number: {soNumber}</Text>
            <Text style={styles.subTitle}>{customer}</Text>
          </View>

          <Text style={styles.sectionTitle}>Item List</Text>

          <FlatList
            ref={flatListRef}
            style={{ flex: 1 }}
            data={records}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: 20,
              flexGrow: 1,
            }}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                });
              }, 300);
            }}
          />

        
          <View
            style={[
              styles.inputRowWrapper,
              { marginBottom: Platform.OS === 'android' ? keyboardHeight : 0 },
            ]}
          >
            <View style={styles.inputRow}>
              <TextInput
                ref={serialInputRef}
                style={styles.input}
                placeholder="Enter/Scan serial number"
                placeholderTextColor="#999"
                value={serialInput}
                onChangeText={setSerialInput}
                onSubmitEditing={(e) => {
                  const scannedValue = e.nativeEvent.text?.trim();

                  if (scannedValue && selectedId) {
                    handleAddSerial(scannedValue);
                  }
                }}
                returnKeyType="done"
                blurOnSubmit={false}
                autoFocus={true}
                editable={true}
                autoCorrect={false}
                autoCapitalize="characters"
                importantForAutofill="yes"
                underlineColorAndroid="transparent"
                showSoftInputOnFocus={true}/>

              <TouchableOpacity
                style={styles.cameraBtn}
                onPress={handleScanSerial}
                disabled={scanning}>
                {scanning ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Icon name="camera" size={22} color="#fff" />)}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveSerial}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
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
  inputRowWrapper: {
    backgroundColor: '#fff',
    paddingBottom: Platform.OS === 'android' ? 10 : 0,
  },
  inputRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  input: {
    flex: 1,
    backgroundColor: '#F2F2F2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 8 : 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#CCC',
    color: '#000',
  },
  cameraBtn: {
    backgroundColor: '#2563EB',
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderRadius: 8,
  },
  saveBtn: { backgroundColor: '#1C4D8D', paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', marginLeft: 8, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteBtn: { backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', width: 80, marginVertical: 4, borderRadius: 10 },
  deleteText: { color: '#fff', fontWeight: '700', marginTop: 2 },
});