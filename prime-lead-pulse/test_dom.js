const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<body><div aria-label="Message Body">Here is my raw link https://gemini.google.com/u/4/app/2d89c867f4d0fa2a?pageId=none Best Regards</div></body>`);
const document = dom.window.document;
const NodeFilter = dom.window.NodeFilter;

const body = document.querySelector('div[aria-label="Message Body"]');
const treeWalker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
const nodesToReplace = [];
const urlRegex = /(https?:\/\/[^\s<]+)/g;

while(treeWalker.nextNode()) {
  const node = treeWalker.currentNode;
  if (node.parentNode && node.parentNode.tagName === 'A') continue;
  
  // Create a localized regex to avoid stateful issues with /g
  const localRegex = /(https?:\/\/[^\s<]+)/;
  if (localRegex.test(node.textContent)) nodesToReplace.push(node);
}

nodesToReplace.forEach(node => {
  const span = document.createElement('span');
  span.innerHTML = node.textContent.replace(urlRegex, '<a href="$1">$1</a>');
  node.parentNode.replaceChild(span, node);
});

body.querySelectorAll('a').forEach(a => {
  a.href = `http://tracker.com/api/track/link/123?url=${encodeURIComponent(a.href)}`;
});

console.log(body.innerHTML);
