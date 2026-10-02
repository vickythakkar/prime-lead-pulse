const fs = require('fs');

let code = fs.readFileSync('extension/background.js', 'utf8');
code = code.replace(/cached_emails_\$\{currentSession\.user\?\.email\}/g, 'cached_emails_${currentSession.user?.email.toLowerCase()}');
code = code.replace(/cached_emails_\$\{currentSession\.user\.email\}/g, 'cached_emails_${currentSession.user.email.toLowerCase()}');
code = code.replace(/cached_emails_\$\{parentEmail\}/g, 'cached_emails_${parentEmail.toLowerCase()}');
code = code.replace(/cached_emails_\$\{senderEmail\}/g, 'cached_emails_${senderEmail.toLowerCase()}');
fs.writeFileSync('extension/background.js', code);
console.log('Fixed background.js');

let contentCode = fs.readFileSync('extension/scripts/content.js', 'utf8');
contentCode = contentCode.replace(/const senderEmail = getActiveSenderEmail\(\);/g, 'let senderEmail = getActiveSenderEmail(); if (senderEmail) senderEmail = senderEmail.toLowerCase();');
fs.writeFileSync('extension/scripts/content.js', contentCode);
console.log('Fixed content.js');
