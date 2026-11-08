# Verification

The Node test suite covers shared-store migration, combined backup restoration, partial imports from both earlier apps, atomic validation, quota failure recovery, cloning, corrupted-record preservation, musical seed exports, phrase replacement within a song, and routing under repository subpaths and local-file URLs.

Browser checks were run against the actual built app over a local HTTP preview:

- Song passage → phrase preview → saved entry → chord experiment → whole-song variation.
- Both collection counts updating within the same document.
- One combined backup preserving the song variation, phrase experiment, personal notes, and entry order.
- Combined restoration and importing an earlier Lab backup while retaining the song collection.
- Stopping synthesized playback and local-recording playback when switching workspaces.
- Closing an editor when navigating away through browser history.
- Reopening an identical phrase preview after leaving it with Back.
- A 390-pixel viewport without horizontal page overflow, with the help dialog usable.
- No browser console errors in the tested flows.

The automation browser permits HTTP(S) URLs and blocked a direct `file:` navigation, so a double-click launch was not exercised by that browser. The generated HTML embeds all code, styles, templates, and data; build checks verify there are no external script or stylesheet dependencies. Local-file route roundtrips are covered by the Node tests.

These are application checks. They do not turn the included working song reduction into a verified musical transcription. Its uncertainty and sources remain visible in the app.
