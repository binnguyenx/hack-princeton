# Dev MCP / debug setup (3D bone editor)

## Launch

```bash
cd app && npm install && npm run sync:fixtures && npm run dev
```

Open the printed localhost URL.

## Coding-agent access

1. **Browser automation:** use Playwright MCP (or Cursor browser tools) against the Vite URL.
2. **Viewport:** screenshot the element `[data-testid="viewport"]`.
3. **Console:** check for unexpected errors after load.
4. **Live objects / ops:** in the page console:

```js
window.__hackPrincetonDebug.readState()
window.__hackPrincetonDebug.ops.createCandidate(window.__hackPrincetonDebug.ctx, 'sample-000')
```

5. **On-disk samples:** see [`data/README.md`](../data/README.md). Fixture package: `data/fixtures/demo-project/` (also copied to `app/public/fixtures/demo-project/`).

## Verify checklist (S8)

- [ ] App loads; viewport paints
- [ ] Console free of unexpected errors
- [ ] `readState` returns project + samples
- [ ] `createCandidate` + `transformCandidate` via bridge
- [ ] Sample `metadata.json` readable under `data/samples/`
