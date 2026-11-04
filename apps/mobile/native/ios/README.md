# Noname iOS

The app bundles the complete game, including code, images, fonts and audio. WebView requests and file reads use the installed resources; old external files cannot override bundled game content.

Game version is maintained only in `apps/core/package.json`. Android reads this manifest directly. Run `pnpm -F @noname/mobile sync:ios` before an iOS build to synchronize the native version. Platform build numbers are derived from the same game version.

The app uses Documents for exported settings and replays under `export/`. It does not create directories for importing art, voices or extensions. File sharing in Files/Finder remains available for retrieving exports.

The `BundledFileSystem` plugin and `src/platform/ios.ts` provide file APIs for bundled resources and user data. `NonameRouter` serves WebView requests directly from the app bundle.
