# LinkedIn Auto Welcome & Responder (Chrome Extension)

An automated, human-like welcome message responder for LinkedIn connections. 

Designed for safety, zero platform ban risk, and complete customization. Whenever someone accepts your connection request (or you accept theirs), this extension detects the new connection and automatically sends your personalized welcome message.

---

## 🌟 Key Features

* **100% Free & Self-Hosted:** No monthly subscriptions, no proxy costs, and no third-party APIs.
* **Keyword-Based Conditional Messaging:** Configure targeted rules based on job title, industry, or location keywords (e.g. realtors in USA). If a connection matches your keywords, it sends a targeted template; otherwise, it seamlessly falls back to your default template!
* **Dual Dashboard Interface:**
  * **Toolbar Popup:** Quick controls, live daily progress bar, targeted rules editor, and instant scan button.
  * **Full-Page Command Center:** Dedicated options dashboard with multi-rule editor, in-depth stats, and CSV export.
* **Smart Dynamic Placeholders:** Supports `{firstName}` and `{fullName}` tags with smart honorific and title stripping (e.g. cleans "Dr. John Doe, MBA" into "John").
* **Human-Like Safety Delays:** Configurable randomized pauses (default: 25–45 seconds) between messages so your activity mirrors genuine human behavior.
* **Daily Quota Safety Cap:** Strict daily send limit (default: 15 messages/day) to keep your account safe from LinkedIn spam algorithms.
* **Duplicate Prevention:** Tracks all sent connections in local storage; never messages the same person twice.
* **Chat History Detection:** Automatically skips connections if an existing conversation thread already exists.
* **Live In-Page HUD:** A discreet on-screen status widget on LinkedIn showing current progress, countdown timers, which rule matched, and an instant emergency stop button.

---

## 🚀 Installation (Takes 30 Seconds)

1. Open **Google Chrome**.
2. Navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select this folder:
   ```text
   C:\Users\vicky\Desktop\Technical Things\PROps Things\linkedin-auto-welcome
   ```
6. The extension is now installed! Pin it to your Chrome toolbar for easy access.

---

## 📱 How It Works With Your Phone & Laptop

1. **Send requests from anywhere:** You can send connection requests from your phone, laptop, or tablet.
2. **Accept requests from anywhere:** You can accept inbound invitations on your phone as well.
3. **Automatic Catch-Up:** Whenever you open your laptop with Chrome running:
   * The extension checks your connections list.
   * It identifies anyone newly connected who hasn't received a welcome message yet.
   * It opens their chat, types your personalized template, and sends it with natural human pauses.

---

## ⚙️ Configuration & Recommended Settings

Click the extension icon in your Chrome toolbar:

| Setting | Default Value | Recommended Range | Description |
| :--- | :--- | :--- | :--- |
| **Daily Limit** | 15 | 10 – 20 | Maximum welcome messages sent per 24 hours. |
| **Delay Range** | 25 – 45 sec | 20 – 60 sec | Randomized resting pause between sending messages. |
| **Skip Existing Chats** | Enabled | Enabled | Prevents sending generic welcome messages to old clients or friends. |
| **Check Interval** | 60 mins | 30 – 120 mins | Frequency of automatic background checks when Chrome is open. |

---

## 📝 Template Ideas

### Option 1: Friendly & Professional (Default)
```text
Hi {firstName}, thanks for connecting! Looking forward to keeping in touch and following your updates.
```

### Option 2: Networking / Mutual Value
```text
Hey {firstName}, great to connect with you! I saw your work in your industry and wanted to reach out. Hope you're having a productive week!
```

### Option 3: Conversational Starter
```text
Hi {firstName}, glad we connected! Always eager to expand my network with fellow professionals. How are things going on your end?
```

---

## 🔒 Safety Best Practices

1. **Keep daily limits conservative:** Start with **10–15 messages per day** for the first week before increasing.
2. **Never send sales pitches immediately:** Treat your first message as a genuine greeting. Users who report messages as spam can trigger account reviews.
3. **Keep Chrome open:** The extension operates quietly in the background as long as Chrome is running on your computer.

---

## 📄 License
MIT License. Created for personal, private outreach automation.
