const fs = require('fs');
let code = fs.readFileSync('extension/scripts/content.js', 'utf8');

code = code.replace("const base = apiUrl.replace(/\\/$/, '');", 'const base = "https://prime-lead-pulse-sigma.vercel.app";');

fs.writeFileSync('extension/scripts/content.js', code);
