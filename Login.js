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