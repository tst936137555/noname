`distribution-unicode.tar` is a POSIX PAX archive with two UTF-8 resources under
`dist/audio/die/`: `dc_zhangyì.mp3` and `语音.mp3`. Each file contains its basename
encoded as UTF-8. It was generated with Python's `tarfile.PAX_FORMAT`.

The Windows regression test reads this fixture, matching the CI flow where
Linux creates the archive and Windows extracts it. On Unix, the test creates
the archive with the same `tar --format=pax` command used by CI.
