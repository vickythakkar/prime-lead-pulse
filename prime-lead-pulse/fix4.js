const fs = require('fs');
let code = fs.readFileSync('extension/scripts/content.js', 'utf8');

const target = `      emailCache.push({
        id: emailId,
        sender_email: senderEmail,
        recipient: recipient,
        subject: subject,
        created_at: new Date().toISOString(),
        status: 'Unopened',
        opens: 0,
        clicks: 0,
        events: []
      });`;

const replacement = `      const newEmail = {
        id: emailId,
        sender_email: senderEmail,
        recipient: recipient,
        subject: subject,
        created_at: new Date().toISOString(),
        status: 'Unopened',
        opens: 0,
        clicks: 0,
        events: []
      };
      emailCache.push(newEmail);
      chrome.storage.local.get(['cached_emails_' + senderEmail], (data) => {
        const cache = data['cached_emails_' + senderEmail] || [];
        cache.push(newEmail);
        chrome.storage.local.set({ ['cached_emails_' + senderEmail]: cache });
      });`;

code = code.replace(target, replacement);
fs.writeFileSync('extension/scripts/content.js', code);
