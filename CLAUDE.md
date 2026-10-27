# Fieldline Search Mission Replay

Dependency-free ES modules; no build step. Run `npm test` before finishing a change.

Style (borrowed from ai-factory, enforced by `src/style.test.js`): top-level functions stay at 20 lines or fewer (aim for 5 to 10), and source has no comments, so name things instead. Tests are `<name>.test.js` beside the module.

- Keep pure logic (planning, telemetry, analysis, export) free of DOM access so it runs in Node.
- Never reuse observed coordinates as the planned reference.
- All UI text and exports must keep labeling data as simulated; never claim detection or search success.
- Update README.md and initial-spec.md when behavior or supported geometry changes.
