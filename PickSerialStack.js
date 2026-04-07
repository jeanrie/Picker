import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PickSerial from './PickSerial';
import PickDetails from './PickDetails';
import SerialsScreen from './SerialsScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const Stack = createNativeStackNavigator();

export default function PickSerialStack() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack.Navigator>
        <Stack.Screen name="PickSerial" component={PickSerial} options={{ headerShown: false }} />
        <Stack.Screen name="PickDetails" component={PickDetails} options={{ headerShown: false }} />

        <Stack.Screen name="SerialsScreen" component={SerialsScreen} options={{ headerShown: false }} />

      </Stack.Navigator>

    </GestureHandlerRootView>
  );
}
