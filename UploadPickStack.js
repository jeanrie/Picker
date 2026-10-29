//UploadPickStack.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UploadSO from './UploadSO';
import UploadPickSO from './UploadPickSO';

const Stack = createNativeStackNavigator();

export default function PickSerialStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="UploadSO" 
        component={UploadSO} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="UploadPickSO" 
        component={UploadPickSO} 
        options={{ headerShown: false }} 
      />
    </Stack.Navigator>
  );
}
