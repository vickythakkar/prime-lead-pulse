const fs = require("fs");
let code = fs.readFileSync("extension/scripts/content.js", "utf8");

// Fix 1: Casing in onChanged
code = code.replace(
  /changes\[\`cached_emails_\$\{currentEmail\}\`\]/,
  "changes[`cached_emails_${currentEmail.toLowerCase()}`]"
);

// Fix 2: Injection logic
code = code.replace(
  /if \(\!record\) return;/,
  `if (!record) return;

      const emailCard = dateEl.closest('.adn');
      if (emailCard) {
        const senderEl = emailCard.querySelector('.gD');
        const senderEmail = senderEl ? senderEl.getAttribute('email') : null;
        const currentEmail = getActiveSenderEmail();
        if (senderEmail && currentEmail && senderEmail.toLowerCase() !== currentEmail.toLowerCase()) {
          return;
        }
      }`
);

// Fix 3: CREATE_EMAIL lowercase cache sets
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
console.log("Fixed content.js via regex");
