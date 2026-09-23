# Smooth trim preview and saved playback — 21 September 2026

Tyler reported delayed drag previews and saved trims playing the full recording.
The preceding inline trim implementation only enforced bounds in edit mode.
The real 15.450-second, 1080p/60 H.264 capture has keyframes every two seconds;
pointer updates repeatedly called MediaPlayer.setPosition. Native verification
also exposed playback starting at an earlier keyframe after a seek.

Changes are scoped to the native Highlights library:

- Predecode bounded 60 fps JPEG edit frames with existing FFmpeg. Display the
  small local image synchronously while dragging; no video seeks on this path.
  Retain a latest-position, 40ms fallback when frames cannot be prepared.
- Confirm helper save success before leaving the editor. Failures remain visible.
  Update the catalog immediately from the confirmed response.
- Use saved bounds for library duration and the zero-based normal timeline.
  Render a full-resolution H.264 playback copy containing only the saved range.
  Normal playback cannot show excluded portions of the original. The original
  remains available for subsequent editing and export still uses saved bounds.
- Cache is disposable, source/range keyed and bounded to 256 MiB. Work is
  serialized by a file lock, completed files publish by rename, interrupted
  producers terminate FFmpeg and discard partial results.

## Verification

- 23 plugin JS tests passed, including saved-range regression (red before fix).
- Five focused QML timeline tests passed.
- 16 focused media/preview/helper/repair tests passed. New media test checks an
  exact one-second decoded frame, cache reuse, original byte preservation and a
  rendered 900ms cut between non-keyframe boundaries.
- Typecheck, source/installed plugin validation, QML parsing and diff whitespace
  checks passed. Full gameplay build/suites were not run for this native-only fix.
- Ibara task `task_af58ce1e956c4cfcb35b06fca1a5b4c6`, isolated muted catalog and
  copy of the full 15.45-second recording: both bracket drags show corresponding
  frames; 120 alternating preview-position updates measured p95/max 11ms for
  the synchronous QML update/image load. This is not an input-to-photon measure.
- Native save of approximately 3.62–6.00 seconds produced a ~2.37-second 1080p
  MP4 (frame quantization), shorter library duration, zero-based playback, correct
  starting scene and endpoint stop. Reopen restored both handles. The native
  fixture simulates catalog save acknowledgment; real helper behavior is covered
  separately by tests. No real clip trim was changed during verification.
- Ibara released; fixture and terminal closed. Temporary HTTP server stopped.
  Screenshot `output/highlights-smooth-2026-09-21/trim-final.png` collected and
  SHA-256 verified: `6bb7d73dceeae5417d222c520613fb0130f7228f93a7d415873294fa8b5642db`.

## Installation

Installed `HighlightsWindow.qml`, `HighlightsModel.js`, `Service.qml` and the
new `scripts/highlights-preview.py` in the existing Veelox plugin. Original
installed files are backed up under
`output/highlights-smooth-2026-09-21/installed-backup`. Byte equality verified;
supported `omarchy restart shell` completed and shell ping returned `ok`.
No game deployment, GitHub publication or recording deletion.

## Sources and limits

Existing Qt 6.11.2 / FFmpeg stack retained. Read the official
[Qt Image contract](https://doc.qt.io/qt-6/qml-qtquick-image.html), including
synchronous local loading, image cache and bounded dimensions, and inspected
installed Qt multimedia metadata plus the existing FFmpeg export implementation.
Native preview timing is from Ibara; Tyler's live hardware may differ. A new
clip's frames and a new saved cut require one-time preparation. Long recordings
over two minutes are outside the current short-highlight workflow. Existing
automatic-highlight event-retention validation remains in the helper; a rejected
cut now reports its failure instead of falsely claiming success.
