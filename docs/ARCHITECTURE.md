# Architecture

Harmony Studio is a static, single-document application. It has no server or account system.

## Shared project

`src/store.js` owns one versioned browser-storage record, `harmony-studio-v1`. Its `lab` and `atlas` parts retain the previous editors' data schemas. Combined backups include both parts, so a phrase's song reference can travel with its source song. Legacy backups and same-origin legacy browser records are migrated with validation.

The store validates an import before replacing state. Failed writes keep the session's in-memory state available for backup. Invalid stored data is retained for recovery instead of silently overwritten.

## Two views, one route

`src/app.js` owns the header, navigation, combined backup/import, active workspace, and view lifecycle. Routes use `#songs` or `#lab` with an optional query after `?`, so repository subpaths and local-file use need no server rewrite rules.

Each editor is a component in an open ShadowRoot. This scopes notation styles and existing control IDs without an iframe or another document. `src/runtime.js` supplies a scoped document, view-local route events, and a storage adapter backed by the shared store. Switching workspaces stops playback. Replacing a collection disposes editor resources and remounts both views from the validated store.

Existing phrase/source links are intercepted by the shell and routed inside the same document. Phrase preview and whole-song variation preview preserve originals before saving an alternative.

## Musical engine and data

- `src/harmony-core.js`: chords, voicings, spelling, transposition, phrase MIDI/MusicXML.
- `src/atlas-core.js`: song sections, timeline, phrase extraction, song variations, full-song MIDI.
- `src/views/lab`: phrase editor, music examples, source connection.
- `src/views/songs`: section map, song analysis, local recording player.
- `data/library.json`, `data/songs.json`: educational starter collections, with provenance and uncertainty.

User collections are not written into source files or automatically sent to GitHub. Audio uses local file selection and object URLs for the current browser session.

## Build and checks

The dependency-free Node build embeds templates, styles, data, and scripts into a single HTML file. It checks JavaScript syntax before writing. The test suite covers storage migration and atomic import, portability routes, musical seed integrity, phrase transfer, and preserving the surrounding song when a phrase changes.

Generated `index.html` and `dist/index.html` are committed intentionally so a browser upload is immediately usable. GitHub CI rebuilds and detects drift. The optional manual Pages workflow publishes only `dist`.
