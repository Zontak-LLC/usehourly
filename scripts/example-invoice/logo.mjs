import { chromium } from "@playwright/test";

const html = `<html><body style="margin:0;background:white">
<div id="l" style="display:inline-flex;align-items:center;gap:14px;padding:10px 14px;font-family:Georgia,serif">
  <svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#1f3a5f"/><path d="M18 40 C24 18, 40 18, 46 40" stroke="#f2b544" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="32" cy="40" r="4" fill="#f2b544"/></svg>
  <div><div style="font-size:30px;font-weight:700;color:#1f3a5f;letter-spacing:.5px">OKAFOR</div><div style="font-size:12px;letter-spacing:4px;color:#6b7280">DESIGN STUDIO</div></div>
</div></body></html>`;
const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor: 2 });
await p.setContent(html);
await p.locator("#l").screenshot({ path: process.argv[2], omitBackground: false });
await b.close();
