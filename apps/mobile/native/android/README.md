# Noname Android

The app bundles the complete game, including code, images, fonts and audio. WebView requests and file reads use the installed resources; old external files cannot override bundled game content.

Game version is maintained only in `apps/core/package.json`. Android reads this manifest directly. Run `pnpm -F @noname/mobile sync:ios` before an iOS build to synchronize the native version. Platform build numbers are derived from the same game version.

Android starts without SAF directory permission. Access is requested only for writes such as exporting settings or replays. Exported files go to the selected directory under `export/`.

The `SafFs` plugin and `src/platform/android.ts` provide file APIs for user data; APK assets remain read-only.
