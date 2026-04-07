import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Login from '.Login';
import Tabs from './Tabs';

const Stack = createNativeStackNavigator();

export default function RootStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={Login} />
      <Stack.Screen name="Tabs" component={Tabs} />
    </Stack.Navigator>
  );
}
