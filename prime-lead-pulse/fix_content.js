const fs = require("fs");
let code = fs.readFileSync("extension/scripts/content.js", "utf8");

code = code.replace(
  "changes[`cached_emails_${currentEmail}`]", 
  "changes[`cached_emails_${currentEmail.toLowerCase()}`]"
);

const targetInject = `    const dateRows = document.querySelectorAll('.g3');\n    dateRows.forEach(dateEl => {\n      if (dateEl.dataset.plpBtn) return;\n      if (!record) return;`;

const replacementInject = targetInject + `\n      \n      const emailCard = dateEl.closest('.adn') || document;\n      const senderEl = emailCard.querySelector('.gD');\n      const senderEmail = senderEl ? senderEl.getAttribute('email') : null;\n      const currentEmail = getActiveSenderEmail();\n      if (senderEmail && currentEmail && senderEmail.toLowerCase() !== currentEmail.toLowerCase()) {\n        return;\n      }`;

code = code.replace(targetInject, replacementInject);

code = code.replace(
  /chrome\.storage\.local\.get\(\[\'cached_emails_\' \+ senderEmail\],/g,
  "chrome.storage.local.get(['cached_emails_' + senderEmail.toLowerCase()],"
).replace(
  /const cache = data\[\'cached_emails_\' \+ senderEmail\] \|\| \[\];/g,
  "const cache = data['cached_emails_' + senderEmail.toLowerCase()] || [];"
).replace(
  /chrome\.storage\.local\.set\(\{\s*\[\'cached_emails_\' \+ senderEmail\]:\s*cache\s*\}\);/g,
  "chrome.storage.local.set({ ['cached_emails_' + senderEmail.toLowerCase()]: cache });"
);

fs.writeFileSync("extension/scripts/content.js", code);
console.log("Fixed content.js");
