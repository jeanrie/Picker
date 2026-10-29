// Login.js
import React, { useEffect, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { executeQuery } from './db';
import { DEFAULT_ENVIRONMENTS, getEnvironments } from './serverConfig';

export default function Login({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [environments, setEnvironments] = useState(DEFAULT_ENVIRONMENTS);
  const [selectedEnvironment, setSelectedEnvironment] = useState(null);
  const [serverConfigured, setServerConfigured] = useState(false);
  const [loading, setLoading] = useState(false);

  
  useEffect(() => {
    loadServerConfig(true);
    const unsubscribe = navigation.addListener('focus', () => loadServerConfig(false));
    return unsubscribe;
  }, [navigation]);

  const loadServerConfig = async (isInitial) => {
    try {
      
      const envs = await getEnvironments();
      setEnvironments(envs);

      const saved = await AsyncStorage.getItem('SERVER_CONFIG');

      if (!saved) {
        setServerConfigured(false);
        return;
      }

      const config = JSON.parse(saved);

      setServerConfigured(!!(config.serverName && config.serverUser && config.serverPass));

     
      if (isInitial) {
        setSelectedEnvironment(null);
      } else {
        setSelectedEnvironment((prev) => (prev ? config.environment || prev : prev));
      }
    } catch (error) {
      console.log('Failed to load server config:', error);
      setServerConfigured(false);
    }
  };

  // Select environment 
  const handleSelectEnvironment = async (environment) => {
    try {
      const envs = await getEnvironments();
      const environmentConfig = envs[environment];

      if (!environmentConfig) {
        Alert.alert('Error', 'Invalid server environment.');
        return;
      }

      const saved = await AsyncStorage.getItem('SERVER_CONFIG');
      const existingConfig = saved ? JSON.parse(saved) : {};

      const updatedConfig = {
        ...existingConfig,
        environment: environmentConfig.key,
        mainDB: environmentConfig.mainDB,
        subDB: environmentConfig.subDB,
      };

      await AsyncStorage.setItem('SERVER_CONFIG', JSON.stringify(updatedConfig));

      setEnvironments(envs);
      setSelectedEnvironment(environment);
      setServerConfigured(
        !!(updatedConfig.serverName && updatedConfig.serverUser && updatedConfig.serverPass)
      );

      console.log('[SERVER] Environment selected:', environment);
      console.log('[SERVER] Main DB:', environmentConfig.mainDB);
      console.log('[SERVER] Sub DB:', environmentConfig.subDB);
    } catch (error) {
      console.log('Environment selection error:', error);
      Alert.alert('Error', 'Failed to select server environment.');
    }
  };

  const handleLogin = async () => {
    if (!selectedEnvironment) {
      Alert.alert('Select Server', 'Please select a server first.');
      return;
    }

    try {
      const saved = await AsyncStorage.getItem('SERVER_CONFIG');

      if (!saved) {
        Alert.alert('Server Settings', 'Please configure the server settings first.');
        return;
      }

      const config = JSON.parse(saved);

      if (!config.serverName || !config.serverUser || !config.serverPass) {
        Alert.alert(
          'Server Settings',
          'Please configure Server Name/IP, Username and Password first.'
        );
        navigation.navigate('Settings');
        return;
      }

      if (!config.mainDB || !config.subDB) {
        Alert.alert('Server Settings', 'Please configure the database names first.');
        navigation.navigate('Settings');
        return;
      }
    } catch (error) {
      console.log('Config validation error:', error);
      Alert.alert('Error', 'Unable to read server configuration.');
      return;
    }

    if (!username || !password) {
      Alert.alert('Missing fields', 'Please enter username and password.');
      return;
    }

    try {
      setLoading(true);

      const cleanUser = String(username).trim().replace(/'/g, "''");
      const cleanPass = String(password).trim().replace(/'/g, "''");

      const saved = await AsyncStorage.getItem('SERVER_CONFIG');
      if (!saved) throw new Error('Server configuration not found.');

      const config = JSON.parse(saved);

      console.log('[LOGIN]', config.environment, config.mainDB, config.subDB, config.serverName);

      const rows = await executeQuery(`
        EXEC dbo.PasswordCheck 
          @Username = '${cleanUser}', 
          @Password = '${cleanPass}'
      `);

      if (!rows || !rows.length) {
        Alert.alert('Login failed', 'Invalid username/password or inactive account.');
        return;
      }

      const user = rows[0];

      if (!user.user && user.ID) {
        user.user = user.ID;
      }

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
  const selectedConfig = selectedEnvironment ? environments[selectedEnvironment] : null;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.title}>SFS PICKER</Text>
        <Text style={styles.subtitle}>Select server before signing in</Text>

        <Text style={styles.sectionLabel}>Select Server</Text>

        <View style={styles.serverContainer}>
          {Object.values(environments).map((env) => {
            const selected = selectedEnvironment === env.key;
            return (
              <TouchableOpacity
                key={env.key}
                style={[styles.serverButton, selected && styles.serverButtonSelected]}
                onPress={() => handleSelectEnvironment(env.key)}
                disabled={loading}
              >
                <Text style={[styles.serverButtonText, selected && styles.serverButtonTextSelected]}>
                  {env.label}
                </Text>
                <Text style={[styles.databaseText, selected && styles.databaseTextSelected]}>
                  {env.mainDB}
                </Text>
                <Text style={[styles.databaseText, selected && styles.databaseTextSelected]}>
                  {env.subDB}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedConfig && (
          <View style={styles.selectedBox}>
            <Text style={styles.selectedTitle}>Selected Server</Text>
            <Text style={styles.selectedEnvironment}>{selectedConfig.label}</Text>
            <Text style={styles.selectedDatabase}>Main: {selectedConfig.mainDB}</Text>
            <Text style={styles.selectedDatabase}>Sub: {selectedConfig.subDB}</Text>
          </View>
        )}

        <TextInput
          placeholder="Enter Username"
          placeholderTextColor="#666"
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          value={username}
          onChangeText={(text) => setUsername(text.toUpperCase())}
          editable={!loading && !!selectedEnvironment}
        />

        <TextInput
          placeholder="Enter Password"
          placeholderTextColor="#666"
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading && !!selectedEnvironment}
        />

        <TouchableOpacity
          style={[styles.button, (!selectedEnvironment || loading) && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading || !selectedEnvironment}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleConfigureSettings} disabled={loading}>
          <Text style={styles.settingsLink}>Configure Server Settings</Text>
        </TouchableOpacity>

        {!serverConfigured && (
          <Text style={styles.warningText}>Server settings are not configured.</Text>
        )}

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
  title: { fontSize: 30, fontWeight: '700', color: '#111', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#555', textAlign: 'center', marginBottom: 10 },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 4 },
  serverContainer: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  serverButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#D0D7E2',
    backgroundColor: '#F7F9FC',
    borderRadius: 12,
    padding: 4,
    alignItems: 'center',
  },
  serverButtonSelected: { borderColor: '#1C4D8D', backgroundColor: '#1C4D8D' },
  serverButtonText: { fontSize: 16, fontWeight: '700', color: '#1C4D8D', marginBottom: 0 },
  serverButtonTextSelected: { color: '#fff' },
  databaseText: { fontSize: 10, color: '#555', textAlign: 'center', marginTop: 2 },
  databaseTextSelected: { color: '#EAF0FA' },
  selectedBox: { backgroundColor: '#EAF0FA', borderRadius: 10, padding: 8, marginBottom: 10 },
  selectedTitle: { fontSize: 12, color: '#555', marginBottom: 0, textAlign: 'center' },
  selectedEnvironment: { fontSize: 16, fontWeight: '700', color: '#1C4D8D', textAlign: 'center' },
  selectedDatabase: { fontSize: 11, color: '#333', textAlign: 'center' },
  input: {
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
    padding: 15,
    color: '#111',
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#1C4D8D',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { backgroundColor: '#9AA7B8' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  settingsLink: { marginTop: 20, color: '#0046FF', textAlign: 'center', fontSize: 17 },
  warningText: { marginTop: 10, color: '#D35400', textAlign: 'center', fontSize: 12 },
  logo: { resizeMode: 'contain', marginTop: 25, alignSelf: 'center' },
});