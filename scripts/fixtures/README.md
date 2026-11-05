`distribution-unicode.tar` is a POSIX PAX archive with three UTF-8 resources under
`dist/audio/die/`: `dc_zhangyì.mp3`, `语音.mp3`, and `combining-e\u0301.mp3`
(the last name uses a combining accent). Each file contains its basename encoded
as UTF-8. It was generated with Python's `tarfile.PAX_FORMAT`.

The Windows regression test reads this fixture, matching the CI flow where
Linux creates the archive and Windows extracts it. On Unix, the test creates
the archive with the same `tar --format=pax` command used by CI. Both use the
production extraction helper; Windows uses bundled 7-Zip to avoid the runner's
locale-dependent tar filename decoding.
