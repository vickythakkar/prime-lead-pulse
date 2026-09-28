import os
import csv
import time
import base64
import random
import logging
import smtplib
import imaplib
import email.policy
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from google.oauth2 import service_account
from googleapiclient.discovery import build

SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "1GAecP1KrbM_ehj8RjUN9cuEpk0lB7l-1-t_TikAShOs")
SERVICE_ACCOUNT_FILE = "service_account.json"

# ── Logging Setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)5s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Tracking pixel (set to your Vercel domain) ────────────────────────────
TRACKING_ENABLED = True
TRACKING_URL      = "https://props-platform-api.vercel.app/api/track"
TRACKING_CTX      = "prime-realops-outreach"   # campaign label for the dashboard

SENT_FOLDER_CANDIDATES = ["Sent", "Sent Items", "INBOX.Sent", "[Gmail]/Sent Mail"]

EMAIL_SUBJECT = "{name} X PrimeRealOps | Streamlining Your Real Estate Operations"

EMAIL_BODY_TEXT = """\
Hi {name},

Your highest value as a broker is closing deals and scaling your team, not getting bogged down by backend administration and paperwork.

At Prime Real Ops, we function as your complete backend engine. We plug directly into your existing platforms to handle the heavy lifting across three core areas:
- Listing Management
- Transaction Coordination
- Executive Services

With our 72-Hour Rapid Deployment, we can take this off your plate seamlessly with minimal onboarding downtime.

If you are ready to stop managing chaos and start focusing on growth, I'd love to connect.

Are you open to a brief chat? We can set up a time [HERE].

Best Regards,
"""

def get_html_signature(name, is_founder):
    calendly_link = "https://calendly.com/primerealops/primerealops-discovery-call"
    
    if is_founder:
        return f"""
  <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 500px; font-family: Arial, Helvetica, sans-serif;">
    <tr>
      <td width="110" style="vertical-align: top; text-align: center; padding-right: 15px;">
        <img src="https://lh3.googleusercontent.com/d/1Zz6uT1DvadvwclNj0Vihrj0N42gKT9cE" alt="Vicky Thakkar" width="90" height="90" style="border-radius: 50%; display: block; margin: 0 auto 10px auto; object-fit: cover;">
        <a href="{calendly_link}" style="font-weight: bold; color: #0056b3; text-decoration: underline; font-size: 13px;">Book A Call</a>
      </td>
      <td width="3" style="background-color: #0056b3; vertical-align: top;">&nbsp;</td>
      <td style="vertical-align: top; padding-left: 15px;">
        <p style="margin: 0 0 2px 0; font-size: 17px; font-weight: bold; color: #000000; font-family: Georgia, serif;">Vicky Thakkar</p>
        <p style="margin: 0 0 10px 0; font-size: 13px; color: #000000;"><strong>Founder | PrimeRealOps</strong></p>
        <p style="margin: 0 0 4px 0; font-size: 12px; color: #333333;">&#128222; +91 88052 92130, +1 (929) 833-8166</p>
        <p style="margin: 0 0 10px 0; font-size: 12px; color: #333333;">&#128205; Mumbai, India</p>
        <p style="margin: 0 0 10px 0;">
          <a href="https://instagram.com/v.p.thakkar" style="text-decoration: none; margin-right: 6px;"><img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" width="18" height="18" alt="Instagram"></a>
          <a href="https://www.linkedin.com/company/prime-real-ops/" style="text-decoration: none; margin-right: 6px;"><img src="https://cdn-icons-png.flaticon.com/512/174/174857.png" width="18" height="18" alt="LinkedIn"></a>
          <a href="https://wa.me/16786789750" style="text-decoration: none;"><img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" width="18" height="18" alt="WhatsApp"></a>
        </p>
        <p style="margin: 0; font-size: 12px; font-weight: bold; line-height: 1.6; font-family: Georgia, serif; color: #333333;">
          "Jack of all trades, master of none,<br>But oftentimes better than a master of one."
        </p>
      </td>
    </tr>
  </table>
"""
    else:
        # Full name mapping
        full_names = {
            "Shiva": "Shiva Nath",
            "Tyler": "Tyler Durden",
            "Taarak": "Taarak Vakil",
            "Tony": "Tony Rydinger",
            "Michael": "Michael Ross",
            "Kisha": "Kisha Brown",
            "Victor": "Victor Wiseman",
            "Aisha": "Aisha Patel",
            "Dan": "Dan Kenton",
            "Samantha": "Samantha Wheeler",
            "Nisha": "Nisha Desai",
            "Info": "Support Team"
        }
        full_name = full_names.get(name, f"{name} Thakkar") # Default fallback
        
        return f"""
  <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 500px; font-family: Arial, Helvetica, sans-serif;">
    <tr>
      <td width="135" style="vertical-align: top; text-align: center; padding-right: 15px;">
        <img src="https://files.catbox.moe/dpexgs.gif" alt="PrimeRealOps" width="115" height="115" style="border-radius: 10%; display: block; margin: 0 auto 10px auto; object-fit: cover;">
        <a href="{calendly_link}" style="font-weight: bold; color: #0056b3; text-decoration: none; font-size: 13px;">Book A Call</a>
      </td>
      <td width="3" style="background-color: #0056b3; vertical-align: top;">&nbsp;</td>
      <td style="vertical-align: top; padding-left: 15px;">
        <p style="margin: 0 0 2px 0; font-size: 17px; font-weight: bold; color: #000000; font-family: Georgia, serif;">{full_name}</p>
        <p style="margin: 0 0 10px 0; font-size: 13px; color: #000000;"><strong>Operations | <a href="https://primerealops.com" style="color: #000000; text-decoration: none;">PrimeRealOps.com</a></strong></p>
        <p style="margin: 0 0 4px 0; font-size: 12px; color: #333333;">&#128222; <a href="tel:+918805292130" style="text-decoration: underline; color: #0056b3;">+91 88052 92130</a>, <a href="tel:+19298338166" style="text-decoration: underline; color: #0056b3;">+1 (929) 833-8166</a></p>
        <p style="margin: 0 0 10px 0; font-size: 12px; color: #333333;">&#128205; Mumbai, India</p>
        <p style="margin: 0 0 10px 0; font-size: 13px; font-weight: bold;">
          <a href="https://www.linkedin.com/company/prime-real-ops/" style="text-decoration: none; color: #0056b3; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/174/174857.png" width="16" height="16" alt="LinkedIn" style="vertical-align: middle; margin-bottom: 2px;"> LinkedIn</a>
          <span style="color: #999999; margin: 0 5px;">|</span>
          <a href="https://wa.me/16786789750" style="text-decoration: none; color: #0056b3; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" width="16" height="16" alt="WhatsApp" style="vertical-align: middle; margin-bottom: 2px;"> WhatsApp</a>
        </p>
        <p style="margin: 0; font-size: 12px; font-style: italic; font-weight: bold; line-height: 1.6; font-family: Georgia, serif; color: #000000;">
          "Jack of all trades, master of none,<br>But oftentimes better than a master of one."
        </p>
      </td>
    </tr>
  </table>
"""

def get_email_body_html(to_name, sender_name, is_founder):
    calendly_link = "https://calendly.com/primerealops/primerealops-discovery-call"
    signature_html = get_html_signature(sender_name, is_founder)
    
    return f"""\
<!DOCTYPE html>
<html>
<head>
<style>
  .body-text {{ font-family: Georgia, serif; color: #333333; line-height: 1.6; font-size: 15px; }}
  .sig-text {{ font-family: Arial, Helvetica, sans-serif; color: #000000; }}
  .blue-link {{ color: #0056b3; text-decoration: none; font-weight: bold; }}
</style>
</head>
<body style="margin: 0; padding: 0;">

  <div class="body-text">
    <p style="margin-bottom: 20px;"><strong>Hi {to_name},</strong></p>

    <p style="margin-bottom: 20px;">Your highest value as a broker is closing deals and scaling your team, not getting bogged down by backend administration and paperwork.</p>

    <p style="margin-bottom: 20px;">At <a href="https://primerealops.com" class="blue-link">Prime Real Ops</a>, we function as your complete backend engine. We plug directly into your existing platforms to handle the heavy lifting across four core areas:</p>

    <ul style="margin-bottom: 20px; padding-left: 20px;">
      <li style="margin-bottom: 10px;"><strong>Listing Management:</strong> Flawless MLS data entry and compliance checks with a 100% accuracy guarantee.</li>
      <li style="margin-bottom: 10px;"><strong>Transaction Coordination:</strong> Seamless contract-to-close management to keep your clients happy and ensure on-time closings.</li>
      <li style="margin-bottom: 10px;"><strong>Executive Services:</strong> Dedicated, elite real estate VAs to manage your inbox, CRM, and daily operational friction.</li>
      <li style="margin-bottom: 10px;"><strong>Prime Lead Bridge:</strong> Our Robust backend mechanism that routes the callers and enquirers directly to the sellers in real time so no lead is missed 24/7. You can set it up to ring to you or any agent in your firm if you prefer it to.</li>
    </ul>

    <p style="margin-bottom: 20px;">With our 72-Hour Rapid Deployment, we can take this off your plate seamlessly with minimal onboarding downtime.</p>

    <p style="margin-bottom: 20px;">If you are ready to stop managing chaos and start focusing on growth, I'd love to connect.</p>

    <p style="margin-bottom: 30px;"><strong>Are you open to a brief chat? We can set up a time <a href="{calendly_link}" class="blue-link">[HERE]</a>.</strong></p>

    <p style="margin-bottom: 25px;">Best Regards,</p>
  </div>

{signature_html}

</body>
</html>
"""

def get_imap_sent_folder(imap_conn):
    _, folder_list = imap_conn.list()
    available = []
    for entry in folder_list:
        decoded = entry.decode() if isinstance(entry, bytes) else entry
        available.append(decoded)
    for candidate in SENT_FOLDER_CANDIDATES:
        for folder_entry in available:
            if f'"{candidate}"' in folder_entry or f' {candidate}' in folder_entry:
                return candidate
    log.warning("Could not detect Sent folder; defaulting to 'Sent'.")
    return "Sent"

def save_to_sent(msg_bytes, user, password):
    # Gmail SMTP automatically saves sent emails, so we don't need to do it manually.
    if "@gmail.com" in user.lower() or "@diyflatfee.com" in user.lower():
        return
        
    try:
        # If it's a GoDaddy account, we DO need to manually save it
        with imaplib.IMAP4_SSL("imap.secureserver.net", 993) as imap:
            imap.login(user, password)
            sent_folder = get_imap_sent_folder(imap)
            imap.append(
                sent_folder,
                "\\Seen",
                imaplib.Time2Internaldate(time.time()),
                msg_bytes,
            )
            log.debug("  ↳ Saved to IMAP Sent folder: %s", sent_folder)
    except Exception as e:
        log.warning("  ↳ Could not save to Sent folder: %s", e)

def get_contacts_from_sheet():
    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=scopes
    )
    service = build("sheets", "v4", credentials=creds)
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=SPREADSHEET_ID, range="Sheet1!A2:C")
        .execute()
    )
    rows = result.get("values", [])
    contacts = []
    for i, row in enumerate(rows, start=2):
        if len(row) < 2:
            continue
        name = row[0].strip()
        email = row[1].strip()
        sent_status = row[2].strip() if len(row) >= 3 else ""
        if sent_status:
            continue
        if name and email:
            contacts.append({"name": name, "email": email, "row": i})
    return contacts, service

def mark_as_sent(service, row):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"Sheet1!C{row}",
        valueInputOption="RAW",
        body={"values": [[timestamp]]},
    ).execute()

def build_message(to_name, to_email, from_user, sender_name, is_founder):
    first_name = to_name.split()[0]
    subject   = EMAIL_SUBJECT.format(name=first_name)
    body_text = EMAIL_BODY_TEXT.format(name=first_name)
    body_html = get_email_body_html(first_name, sender_name, is_founder)

    # Inject tracking pixel if enabled
    if TRACKING_ENABLED:
        # Base64url-encode the recipient identifier as required by the dashboard
        encoded_email = base64.urlsafe_b64encode(to_email.encode()).decode().rstrip("=")
        pixel_tag = (
            f'<img src="{TRACKING_URL}?id={encoded_email}&ctx={TRACKING_CTX}" '
            f'width="1" height="1" alt="" style="display:none" />'
        )
        body_html = body_html.replace("</body>", f"{pixel_tag}\n</body>")

    # ── Build final message ──────────────────────────────────────────
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    from_display = f"{sender_name} | PrimeRealOps"
    msg["From"]    = f"{from_display} <{from_user}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))
    return msg

def get_smtp_host_port(email_address):
    if "@gmail.com" in email_address.lower() or "@diyflatfee.com" in email_address.lower():
        return "smtp.gmail.com", 465
    return "smtpout.secureserver.net", 465

def load_accounts():
    accounts = []
    if not os.path.exists("warmup_accounts.csv"):
        log.error("warmup_accounts.csv not found!")
        return []
        
    with open("warmup_accounts.csv", "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = row.get("Email", "").strip()
            password = row.get("AppPassword", "").strip()
            if not email or not password:
                continue
                
            # Rule 1: No cold emails from vickythakkar6143, diyflatfee
            if any(x in email.lower() for x in ["vickythakkar6143", "diyflatfee"]):
                continue
                
            # Determine properties
            if email.lower() in ["vickythegeneralist@gmail.com", "info@primerealops.com"]:
                count = random.randint(7, 10)
                is_founder = True
                name = "Vicky Thakkar"
            elif any(x in email.lower() for x in ["michael.primerealops", "shiva.primerealops", "michael.primerealops.com"]):
                count = random.randint(4, 7)
                is_founder = False
                name = email.split('.')[0].capitalize()
            else:
                count = random.randint(7, 10)
                is_founder = False
                name = email.split('.')[0].capitalize()
                
            accounts.append({
                "email": email,
                "password": password,
                "name": name,
                "is_founder": is_founder,
                "remaining": count
            })
    return accounts

def send_mass_outreach():
    log.info("Loading accounts for mass outreach...")
    active_accounts = load_accounts()
    
    total_emails = sum(acc["remaining"] for acc in active_accounts)
    log.info(f"Loaded {len(active_accounts)} accounts. Planning to send {total_emails} total emails.")
    
    # Generate the round-robin queue
    queue = []
    while active_accounts:
        for acc in list(active_accounts):
            queue.append(acc.copy()) # Snapshot for this send
            acc["remaining"] -= 1
            if acc["remaining"] == 0:
                active_accounts.remove(acc)
                
    log.info("Fetching unsent contacts from Google Sheet...")
    contacts, service = get_contacts_from_sheet()
    
    if len(contacts) < len(queue):
        log.warning(f"Only {len(contacts)} contacts available, but {len(queue)} emails planned. Will send {len(contacts)}.")
        queue = queue[:len(contacts)]
        
    if not queue:
        log.info("Nothing to send. Exiting.")
        return

    log.info("Starting round-robin mass outreach...")
    
    for i, account in enumerate(queue):
        contact = contacts[i]
        try:
            msg = build_message(
                to_name=contact["name"], 
                to_email=contact["email"], 
                from_user=account["email"],
                sender_name=account["name"],
                is_founder=account["is_founder"]
            )
            raw_msg = msg.as_bytes(policy=email.policy.SMTP)

            host, port = get_smtp_host_port(account["email"])

            with smtplib.SMTP_SSL(host, port) as server:
                server.login(account["email"], account["password"])
                server.send_message(msg)

            save_to_sent(raw_msg, account["email"], account["password"])
            mark_as_sent(service, contact["row"])
            
            log.info(f"✓ Sent ({i+1}/{len(queue)}) [via {account['email']}] -> {contact['name']} <{contact['email']}>")
            
            # Wait between EVERY email sent
            if i < len(queue) - 1:
                unique_remaining = len(set(a["email"] for a in queue[i:]))
                delay = 75 if unique_remaining <= 2 else 40
                log.info(f"Waiting {delay} seconds before next email (Active accounts remaining: {unique_remaining})...")
                time.sleep(delay)
                
        except Exception as e:
            log.error(f"Failed to send to {contact['email']} via {account['email']}: {e}")

    log.info("\nMass outreach complete.")
    log.info(f"Total emails sent: {len(queue)}")

if __name__ == "__main__":
    send_mass_outreach()
