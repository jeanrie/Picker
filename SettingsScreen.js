// SettingsScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MSSQL from 'react-native-mssql';
import {
  DEFAULT_ENVIRONMENTS,
  getEnvironments,
  saveEnvironmentDBs,
} from './serverConfig';

export default function SettingsScreen({ navigation }) {
  const [environments, setEnvironments] = useState(DEFAULT_ENVIRONMENTS);
  const [environment, setEnvironment] = useState(null);
  const [serverName, setServerName] = useState('');
  const [serverUser, setServerUser] = useState('');
  const [serverPass, setServerPass] = useState('');
  const [mainDB, setMainDB] = useState('');
  const [subDB, setSubDB] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const envs = await getEnvironments();
      setEnvironments(envs);

      const saved = await AsyncStorage.getItem('SERVER_CONFIG');
      if (!saved) return;

      const config = JSON.parse(saved);

      setServerName(config.serverName || '');
      setServerUser(config.serverUser || '');
      setServerPass(config.serverPass || '');

      if (config.environment && envs[config.environment]) {
        setEnvironment(config.environment);
        setMainDB(envs[config.environment].mainDB);
        setSubDB(envs[config.environment].subDB);
      }
    } catch (err) {
      console.log('Failed to load config:', err);
    }
  };

  const handleSelectEnvironment = (key) => {
    const cfg = environments[key];
    if (!cfg) {
      Alert.alert('Error', 'Invalid server environment.');
      return;
    }
    setEnvironment(key);
    setMainDB(cfg.mainDB);
    setSubDB(cfg.subDB);
  };

 
  const testDatabase = async (baseConfig, dbName) => {
    try {
      await MSSQL.connect({ ...baseConfig, database: dbName });
      const result = await MSSQL.executeQuery('SELECT 1 AS test');
      if (!result || result.length === 0) {
        throw new Error(`Connected to ${dbName} but query failed.`);
      }
    } finally {
      try {
        await MSSQL.close();
      } catch {}
    }
  };

  const testAndSave = async () => {
    if (!environment) {
      Alert.alert('Select Server', 'Please select GREATBUYS or HKUDSDEV.');
      return;
    }

    if (!serverName.trim() || !serverUser.trim() || !serverPass) {
      Alert.alert('Missing Info', 'Please fill up Server Name/IP, Username and Password.');
      return;
    }

    const main = mainDB.trim();
    const sub = subDB.trim();

    if (!main || !sub) {
      Alert.alert('Missing Info', 'Please enter Main Database and Sub Database.');
      return;
    }

    setLoading(true);

    const baseConfig = {
      server: serverName.trim(),
      username: serverUser.trim(),
      password: serverPass,
      port: 1433,
      timeout: 10,
    };

    try {
      console.log('[SETTINGS]', environment, serverName, main, sub);

     
      await testDatabase(baseConfig, main);
      await testDatabase(baseConfig, sub);

      await saveEnvironmentDBs(environment, main, sub);

      await AsyncStorage.setItem(
        'SERVER_CONFIG',
        JSON.stringify({
          environment,
          serverName: serverName.trim(),
          mainDB: main,
          subDB: sub,
          serverUser: serverUser.trim(),
          serverPass,
        })
      );

      Alert.alert(
        'Success',
        `Connected successfully.\n\nEnvironment: ${environment}\nMain DB: ${main}\nSub DB: ${sub}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      console.log('MSSQL error:', err);
      Alert.alert('Connection Failed', err?.message || 'Cannot connect to SQL Server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Server Settings</Text>

      
        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>Select Server</Text>

          {Object.values(environments).map((env) => {
            const selected = environment === env.key;
            return (
              <TouchableOpacity
                key={env.key}
                style={[styles.environmentButton, selected && styles.environmentSelected]}
                onPress={() => handleSelectEnvironment(env.key)}
                disabled={loading}>
                <Text style={[styles.environmentText, selected && styles.environmentTextSelected]}>
                  {env.label}
                </Text>
                <Text style={[styles.databaseText, selected && styles.databaseTextSelected]}>
                  Main: {env.mainDB}
                </Text>
                <Text style={[styles.databaseText, selected && styles.databaseTextSelected]}>
                  Sub: {env.subDB}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* DATABASE NAMES */}
        {!!environment && (
          <View style={styles.formContainer}>
            <Text style={styles.sectionTitle}>Databases ({environment})</Text>

            <Field
              label="Main Database"
              value={mainDB}
              onChangeText={setMainDB}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}/>

            <Field
              label="Sub Database"
              value={subDB}
              onChangeText={setSubDB}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}/>
          </View>
        )}

        {/* SERVER DETAILS */}
        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>SQL Server Connection</Text>

          <Field
            label="Server Name / IP"
            value={serverName}
            onChangeText={setServerName}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}/>
          <Field
            label="Username"
            value={serverUser}
            onChangeText={setServerUser}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}/>
          <Field
            label="Password"
            value={serverPass}
            onChangeText={setServerPass}
            secureTextEntry
            editable={!loading}/>
        </View>

        <TouchableOpacity style={styles.button} onPress={testAndSave} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Test & Save</Text>)}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#ccc' }]}
          onPress={() => navigation.goBack()}
          disabled={loading}>
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
  scroll: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  formContainer: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 10,
    elevation: 2,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4, color: '#111' },
  environmentButton: {
    borderWidth: 2,
    borderColor: '#D0D7E2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  environmentSelected: { backgroundColor: '#1C4D8D', borderColor: '#1C4D8D' },
  environmentText: { fontSize: 16, fontWeight: '700', color: '#1C4D8D' },
  environmentTextSelected: { color: '#fff' },
  databaseText: { fontSize: 12, color: '#555', marginTop: 1 },
  databaseTextSelected: { color: '#EAF0FA' },
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