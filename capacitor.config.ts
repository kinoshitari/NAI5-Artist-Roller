import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kinoshitari.nai5artistroller",
  appName: "NAI5 画师串",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#15191d",
  },
};

export default config;
