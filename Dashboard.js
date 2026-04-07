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