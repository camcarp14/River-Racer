/* Builds play/RiverRacer.html — the whole game (three.js included) in ONE double-clickable file.
   Run: node tools/build_singlefile.js */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const inlined = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  // </script> inside JS strings would end the tag early
  const safe = code.replace(/<\/script>/gi, '<\\/script>');
  return `<script>\n/* ===== ${src} ===== */\n${safe}\n</script>`;
});

fs.mkdirSync(path.join(root, 'play'), { recursive: true });
const out = path.join(root, 'play', 'RiverRacer.html');
fs.writeFileSync(out, inlined);
const mb = (fs.statSync(out).size / 1048576).toFixed(2);
console.log(`built play/RiverRacer.html (${mb} MB) — open it in any browser, no server needed`);
