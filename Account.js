import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, Dimensions, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Account({ navigation }) {
  const [user, setUser] = useState({ name: '' });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const loggedInUser = await AsyncStorage.getItem('LOGGED_IN_USER');
        if (!loggedInUser) return;

        const userObj = JSON.parse(loggedInUser);

        setUser({
          name: userObj.name || userObj.Username || userObj.longname || '',
        });
      } catch (error) {
        console.log('Failed to load user:', error);
      }
    };

    loadUser();
  }, []);

  const confirmLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes', onPress: handleLogout },
      ],
      { cancelable: true }
    );
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('LOGGED_IN_USER');
      navigation.replace('Login');
    } catch (error) {
      Alert.alert('Error', 'Failed to logout. Please try again.');
      console.log(error);
    }
  };

  const screenWidth = Dimensions.get('window').width;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <Text style={styles.title}>SFS Picker</Text>
          <Image
            source={require('./assets/aircon.png')} // replace with your logo path
            style={[styles.logo, { width: screenWidth * 0.40, height: screenWidth * 0.40 }]}
          />
        </View>

        {/* User Info and Logout */}
        <View style={styles.body}>
          <Text style={styles.name}>{user.name}</Text>
          <TouchableOpacity style={styles.button} onPress={confirmLogout}>
            <Text style={styles.buttonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, padding: 24 },
  header: { alignItems: 'center', marginTop: 20, marginBottom: 30 },
  title: { fontSize: 40, fontWeight: '700', color: '#1C4D8D', marginTop: 30 },
  logo: { resizeMode: 'contain', marginBottom: 30 },
  body: { alignItems: 'center' },
  name: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#111' },
  button: {
    backgroundColor: '#396092',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});