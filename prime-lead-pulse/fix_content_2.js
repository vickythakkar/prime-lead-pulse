const fs = require("fs");
let code = fs.readFileSync("extension/scripts/content.js", "utf8");

const targetInject = `    const dateRows = document.querySelectorAll('.g3');
    dateRows.forEach(dateEl => {
      if (dateEl.dataset.plpBtn) return;
      if (!record) return;`;

const replacementInject = targetInject + `
      
      const emailCard = dateEl.closest('.adn');
      if (emailCard) {
        const senderEl = emailCard.querySelector('.gD');
        const senderEmail = senderEl ? senderEl.getAttribute('email') : null;
        const currentEmail = getActiveSenderEmail();
        if (senderEmail && currentEmail && senderEmail.toLowerCase() !== currentEmail.toLowerCase()) {
          return;
        }
      }`;

code = code.replace(targetInject, replacementInject);

fs.writeFileSync("extension/scripts/content.js", code);
console.log("Fixed content.js injection");
