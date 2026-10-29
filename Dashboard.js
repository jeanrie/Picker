// Dashboard.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentEnvironment, envLabel } from './Soenv';

export default function Dashboard({ navigation }) {
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState(null);
  const screenWidth = Dimensions.get('window').width;

  const loadData = async () => {
    try {
      const loggedInUser = await AsyncStorage.getItem('LOGGED_IN_USER');
      if (loggedInUser) {
        const userObj = JSON.parse(loggedInUser);
        setName(userObj.name || userObj.Username || userObj.longname || '');
      }

      const env = await getCurrentEnvironment();
      setEnvironment(env);
    } catch (error) {
      console.log('Failed to load user:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);


  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [navigation]);

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

        {!!environment && (
          <View style={styles.serverBadge}>
            <Text style={styles.serverLabel}>Connected Server</Text>
            <Text style={styles.serverValue}>{envLabel(environment)}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  logo: { resizeMode: 'contain', marginBottom: 50 },
  text: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  serverBadge: {
    marginTop: 24,
    backgroundColor: '#EAF0FA',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  serverLabel: { fontSize: 12, color: '#555' },
  serverValue: { fontSize: 18, fontWeight: '700', color: '#1C4D8D', marginTop: 2 },
});