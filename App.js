// App.js

import React, { useEffect } from 'react';

import {
  NavigationContainer,
} from '@react-navigation/native';

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';

import {
  GestureHandlerRootView,
} from 'react-native-gesture-handler';

import { enableScreens } from 'react-native-screens';

import { KeyboardProvider } from 'react-native-keyboard-controller';

import { initDB } from './dbLocal';

import Login from './Login';
import SettingsScreen from './SettingsScreen';
import Tabs from './Tabs';

enableScreens();

const Stack =
  createNativeStackNavigator();

export default function App() {

  useEffect(() => {

    const initialize = async () => {

      try {

        await initDB();

      } catch (error) {

        console.log(
          'App initialization error:',
          error
        );

      }

    };

    initialize();

  }, []);

  return (

    <KeyboardProvider>

      <GestureHandlerRootView
        style={{ flex: 1 }}
      >

        <NavigationContainer>

          <Stack.Navigator
            screenOptions={{
              headerShown: false,
            }}
          >

            <Stack.Screen
              name="Login"
              component={Login}
            />

            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
            />

            <Stack.Screen
              name="Tabs"
              component={Tabs}
            />

          </Stack.Navigator>

        </NavigationContainer>

      </GestureHandlerRootView>

    </KeyboardProvider>
  );
}