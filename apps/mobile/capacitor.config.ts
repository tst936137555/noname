import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
	appId: "com.libnoname.noname",
	appName: "noname",
	webDir: "../../dist",
	android: {
		path: "native/android",
		// Players explicitly choose local ws:// hosts; remote callbacks remain isolated.
		allowMixedContent: true,
	},
	ios: {
		path: "native/ios",
		contentInset: "never",
		limitsNavigationsToAppBoundDomains: false,
	},
	plugins: {
		App: {},
		SystemBars: {
			hidden: true,
			style: "DARK",
		},
	},
};

export default config;
