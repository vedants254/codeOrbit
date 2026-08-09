# Guide: Creating a New GitHub App

Follow these steps to register a new application on GitHub and configure it correctly.

---

## 1. Navigate to GitHub Apps Settings

Go to [GitHub Apps settings](https://github.com/settings/apps).

---

## 2. Create a New GitHub App

Click the **New GitHub App** button.

![Screenshot of the 'New GitHub App' button](https://github.com/user-attachments/assets/6552ad43-3810-4d6e-9c8e-42464795ea02)

---

## 3. Fill Out App Details

- **GitHub App name:** Enter your desired application name.
- **Homepage URL:** `http://localhost:3000/`
- **Callback URL:** `http://localhost:3000/api/auth/callback/github`
- **Expire user authorization tokens:** _Deselect_ this checkbox.
- **Setup URL:** `http://localhost:3000/`
- **Webhook:** _Deselect_ the **Active** checkbox to disable webhooks.
---

## 4. Set Permissions

### Repository Permissions

- **Contents:** Set to **Read-only**

### Account Permissions

- **Email addresses:** Set to **Read-only**

---

## 5. Create the App

Click the **Create GitHub App** button at the bottom of the page.

---

## 6. Get Your Credentials

- On the next page, copy your **App ID** and **Client ID** and save them securely.
- Click **Generate a new client secret**. Copy the generated secret immediately and save it.  
    _Important: You will not be able to see this secre
t again._

![Screenshot of app credentials and client secret button](https://github.com/user-attachments/assets/a4e50504-e8ca-4b4e-ba05-30e6aee74a2f)

---

## 7. Generate a Private Key

- Scroll to the **Private keys** section.
- Click **Generate a private key**. A `.pem` file will be downloaded.
- Open the file in a code editor (e.g., VS Code), copy the entire contents (including the `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` lines).
- If pasting into a configuration file (e.g., `.env`), wrap the entire key content in double quotes (`"`).

![Screenshot of the private key generation section](https://github.com/user-attachments/assets/ca0b0e96-4e66-4ff3-a59e-bc5aba30eaab)
