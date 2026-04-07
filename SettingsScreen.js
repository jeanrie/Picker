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
