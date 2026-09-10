import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sirverdata.chat',
  appName: 'SirverData Chat',
  webDir: 'dist',
  server: {
    url: 'https://app.sirverdata.top',
    cleartext: true,
    androidScheme: 'https'
  }
};

export default config;
