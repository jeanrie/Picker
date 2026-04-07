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
  const [successSerials, setSuccessSerials] = useState([]);
  const [failedSerials, setFailedSerials] = useState([]);

  

  useEffect(() => {
    const loadRecords = async () => {
      try {
        const savedSerials = await AsyncStorage.getItem(`SO_SERIALS_${soNumber}`);
        const successRaw = await AsyncStorage.getItem(`SUCCESS_SERIALS_${soNumber}`);
        const failedRaw = await AsyncStorage.getItem(`FAILED_SERIALS_${soNumber}`);

        setSuccessSerials(successRaw ? JSON.parse(successRaw) : []);
        setFailedSerials(failedRaw ? JSON.parse(failedRaw) : []);
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
            qty: item.qty ?? 0,
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
    let statusStyle = styles.failedCard; // default

    if (!item.serials || item.serials.length === 0) {
      statusStyle = styles.failedCard; // no serials scanned
    } else {
      const hasSuccess = item.serials.some(s => successSerials.includes(s));
      const hasFailed = item.serials.some(s => failedSerials.includes(s));

      if (hasSuccess && !hasFailed) statusStyle = styles.successCard;
      else if (!hasSuccess && hasFailed) statusStyle = styles.failedCard;
      else statusStyle = styles.partialCard;
    }

    return (
      <View style={[styles.card, statusStyle]}>
        <Text style={styles.descText}>{item.desc}</Text>
        <Text style={styles.qtyText}>
          Qty: {item.qty} | Scanned: {item.serials?.length || 0}
        </Text>

        {item.barcode && <Text style={styles.barcodeText}>{item.barcode}</Text>}

        <Text style={styles.pickText}>PICK LIST</Text>

        <View style={styles.serialList}>
          {item.serials?.length > 0 ? (
            item.serials.map((s, i) => {
              let icon = '⚠️'; // default partial/mixed
              let color = '#FFA500'; // orange

              if (successSerials.includes(s) && !failedSerials.includes(s)) {
                icon = '✔️';
                color = '#28A745'; // green
              } else if (!successSerials.includes(s) && failedSerials.includes(s)) {
                icon = '❌';
                color = '#DC3545'; // red
              }

              return (
                <Text key={`${item.id}_${i}`} style={[styles.serialText, { color }]}>
                  {icon} {s}
                </Text>
              );
            })
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
  successCard: {
    backgroundColor: '#D4EDDA',
    borderColor: '#28A745',
    borderWidth: 1,
  },

  partialCard: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFC107',
    borderWidth: 1,
  },

  failedCard: {
    backgroundColor: '#F8D7DA',
    borderColor: '#DC3545',
    borderWidth: 1,
  },
});