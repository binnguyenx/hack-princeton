# Frozen Node-created application baseline

This tiny SQLite database and volume tree were generated through the original Node application repository before Express removal. All records and bytes are synthetic tests, not clinical data or reconstruction output. The fixture contains one project, two cases, one verified sample, one candidate and two revisions with the current pointer restored to revision0. expected.json is the Node-produced manifest/project-list/byte oracle; sha256.json locks its original files. Tests always copy the fixture to a disposable root, verify Python reads and continued writes, and assert the original files are unchanged.

The full Node→Python→Node and Express→FastAPI→Express→FastAPI generators/tests remain in the independently installed seven-day recovery runtime. No Express dependency is required for these current frozen-fixture regressions.
