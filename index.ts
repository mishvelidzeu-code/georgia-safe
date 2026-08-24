import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

// Registers the landmark-arrival geofencing task (see landmarkGeofencing.ts)
// as early as possible — this must run even on a headless background
// relaunch (iOS waking the app briefly to handle a geofence event), before
// any React component mounts.
import './src/lib/landmarkGeofencing';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
