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
