//Tabs.js
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';

import Dashboard from './Dashboard';
import DownloadSO from './DownloadSO';
import UploadSO from './UploadSO';
import PickSerialStack from './PickSerialStack';
import Account from './Account';
import UploadPickStack from './UploadPickStack'


const Tab = createBottomTabNavigator();

export default function Tabs() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: { height: 48, paddingBottom: 5, paddingTop: 0 },
          tabBarLabelStyle: { fontSize: 10 },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName = 'apps';
            if (route.name === 'Dashboard') iconName = focused ? 'home' : 'home-outline';
            if (route.name === 'DownloadSO') iconName = focused ? 'download' : 'download-outline';
            if (route.name === 'PickSerial') iconName = focused ? 'barcode' : 'barcode-outline';
            if (route.name === 'UploadSO') iconName = focused ? 'cloud-upload' : 'cloud-upload-outline';
            if (route.name === 'Account') iconName = focused ? 'person' : 'person-outline';
            return <Icon name={iconName} size={18} color={focused ? '#2563eb' : '#94a3b8'} />;
          },
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: '#94a3b8',
        })}
      >
        <Tab.Screen name="Dashboard" component={Dashboard} />
        <Tab.Screen name="DownloadSO" component={DownloadSO} options={{ tabBarLabel: 'Download SO' }} />
        <Tab.Screen name="PickSerial" component={PickSerialStack} options={{ tabBarLabel: 'Pick Serial' }} />
        <Tab.Screen name="UploadSO" component={UploadPickStack} options={{ tabBarLabel: 'Upload SO' }} />
        <Tab.Screen name="Account" component={Account} options={{ tabBarLabel: 'Account' }} />
      </Tab.Navigator>
    </SafeAreaView>
  );
}

