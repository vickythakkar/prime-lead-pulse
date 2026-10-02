const fs = require('fs');
let code = fs.readFileSync('extension/scripts/content.js', 'utf8');

const targetStr = `        const base = "https://prime-lead-pulse-sigma.vercel.app";
        const body = compose.querySelector('div[aria-label="Message Body"]');
        if (body) {
          const pixel = document.createElement('img');
          pixel.src = \`\${base}/api/track/pixel/\${emailId}\`;
          pixel.width = 1; pixel.height = 1; pixel.style.display = 'none';
          body.appendChild(pixel);
  
          body.querySelectorAll('a').forEach(a => {`;

const targetStr2 = `        const base = "https://prime-lead-pulse-sigma.vercel.app";
        const body = compose.querySelector('div[aria-label="Message Body"]');
        if (body) {
          const pixel = document.createElement('img');
          pixel.src = \`\${base}/api/track/pixel/\${emailId}\`;
          pixel.width = 1; pixel.height = 1; pixel.style.display = 'none';
          body.appendChild(pixel);

          body.querySelectorAll('a').forEach(a => {`;

const targetRegex = /const base = "https:\/\/prime-lead-pulse-sigma\.vercel\.app";\s*const body = compose.querySelector\('div\[aria-label="Message Body"\]'\);\s*if \(body\) \{\s*const pixel = document\.createElement\('img'\);\s*pixel\.src = `\$\{base\}\/api\/track\/pixel\/\$\{emailId\}`;\s*pixel\.width = 1; pixel\.height = 1; pixel\.style\.display = 'none';\s*body\.appendChild\(pixel\);\s*body\.querySelectorAll\('a'\)\.forEach\(a => \{/g;

const replacement = `const base = "https://prime-lead-pulse-sigma.vercel.app";
        const body = compose.querySelector('div[aria-label="Message Body"]');
        if (body) {
          const pixel = document.createElement('img');
          pixel.src = \`\${base}/api/track/pixel/\${emailId}\`;
          pixel.width = 1; pixel.height = 1; pixel.style.display = 'none';
          body.appendChild(pixel);

          // Wrap raw URLs
          const treeWalker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
          const nodesToReplace = [];
          const urlRegex = /(https?:\\/\\/[^\\s<]+)/g;
          while(treeWalker.nextNode()) {
            const node = treeWalker.currentNode;
            if (node.parentNode && node.parentNode.tagName === 'A') continue;
            if (urlRegex.test(node.textContent)) nodesToReplace.push(node);
          }
          nodesToReplace.forEach(node => {
            const span = document.createElement('span');
            span.innerHTML = node.textContent.replace(urlRegex, '<a href="$1">$1</a>');
            node.parentNode.replaceChild(span, node);
          });

          body.querySelectorAll('a').forEach(a => {`;

code = code.replace(targetRegex, replacement);
fs.writeFileSync('extension/scripts/content.js', code);
console.log('Done!');
