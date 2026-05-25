# Keel Privacy Statement

**Last Updated: May 2026**

Your privacy is extremely important to us. This privacy statement explains the personal data Keel processes, how Keel processes it, and for what purposes. 

Keel is a local-first, privacy-focused desktop writing and note-taking application. Unlike traditional cloud-based note applications, Keel is engineered to run entirely on your local machine with no proprietary intermediate servers. **Our core philosophy is simple: Your notes, your machine, your sovereignty.**

---

## Table of Contents
1. [Personal Data We Collect (And What We Do Not Collect)](#1-personal-data-we-collect-and-what-we-do-not-collect)
2. [How We Process Your Personal Data (Local Processing Only)](#2-how-we-process-your-personal-data-local-processing-only)
3. [Reasons We Share Personal Data (None)](#3-reasons-we-share-personal-data-none)
4. [How to Access and Control Your Personal Data](#4-how-to-access-and-control-your-personal-data)
5. [Direct Cloud Sync (Google Drive Integration)](#5-direct-cloud-sync-google-drive-integration)
6. [Security of Your Data](#6-security-of-your-data)
7. [Cookies and Local Storage](#7-cookies-and-local-storage)
8. [Changes to This Privacy Statement](#8-changes-to-this-privacy-statement)
9. [How to Contact Us](#9-how-to-contact-us)

---

## 1. Personal Data We Collect (And What We Do Not Collect)

Because Keel is a local-first application, **we do not collect, monitor, store, or transmit your personal data or notes to any external Keel servers.** 

### What We Do Not Collect:
* **Your Note Content:** Every word, markdown file, checklist, code block, or asset you insert into Keel remains exclusively on your own computer. We have zero access to your vaults, folders, or document contents.
* **Search Queries:** When you search across your notes, all index compilation and keyword searches are executed locally via SQLite FTS5. No search queries are transmitted to external servers.
* **Usage Telemetry & Analytics:** We do not track your usage habits, menu selections, editing active minutes, or startup frequencies. We do not use third-party analytics packages (like Google Analytics, Mixpanel, or Amplitude) inside the desktop application.
* **Identity Data:** Keel does not require you to create a "Keel Account" or provide an email address, password, or profile information to use the core application.

### Data Stored Locally on Your Machine:
Keel saves files and application states locally on your device's hard drive to enable standard note-taking features:
1. **Local Notes Database:** Your documents are stored inside a secure local database (SQLite) utilizing virtual tables for quick text search indexing.
2. **Continuous Snapshot History:** Keel keeps local delta-snapshots of your edits so you can roll back document states. This history remains strictly local.
3. **Application Preferences:** Preferences such as active theme (dark/light mode), sidebar toggle states, custom background layouts, and custom styling rules are saved in standard local config directories.

---

## 2. How We Process Your Personal Data (Local Processing Only)

To provide a stable and high-performance note-taking environment, Keel performs local computations on your device:

* **FTS5 Indexing:** Your device's local CPU processes and parses note texts to update the local SQLite Full-Text Search (FTS5) index.
* **Snapshot History Compression:** The application locally computes differences (diffs) between document revisions to compress change histories.
* **Secure Token Handling:** When integrating with optional cloud sync, all OAuth state parameters, access tokens, and refresh tokens are stored securely in your operating system's native secure credential manager. They never leave your environment.

---

## 3. Reasons We Share Personal Data (None)

**We do not share, sell, lease, rent, or distribute your personal data, note contents, or configuration metadata to any third parties.** 

Because Keel does not collect your data on external servers, it is structurally impossible for us to:
* Sell your data to advertisers.
* Share your notes with third-party service providers.
* Be compelled to turn over your private journals or databases to governmental bodies (as we do not hold or have access to any keys or host servers containing your files).

---

## 4. How to Access and Control Your Personal Data

Under Keel's local-first architecture, **you possess full, unilateral control over all your personal data.** 

* **Data Access:** Because your notes are stored locally inside a standard SQLite format database, you can access your database files directly through your operating system file manager at any time.
* **Data Export:** Keel provides easy, built-in tools to export your local note database into standard, open Markdown files (.md) and JSON documents, ensuring no vendor lock-in.
* **Data Deletion:** You can completely wipe out all your personal data, notes, snapshot history, and credentials instantly by deleting the local application directory and database files from your computer. 
* **Revoking Sync Permissions:** If you configure Google Drive sync, you can revoke Keel's read/write authority immediately via your Google Account's Third-Party Access dashboard.

---

## 5. Direct Cloud Sync (Google Drive Integration)

Keel includes an optional cloud sync feature to back up your vaults. It is designed with a strict peer-to-peer security posture:

* **Direct API Connections:** When sync is enabled, Keel establishes direct HTTPS tunnels exclusively between your local device and the official Google Drive APIs.
* **No Intermediary Proxies:** Your notes never route through, halt in, or filter via any intermediate servers operated by Keel or third parties. 
* **Authorization Scope:** Keel requests only the specific, minimal scopes necessary to create and manage its own private folder within your Google Drive (the `drive.appdata` scope) and your email address (to identify the connected account). It does not request, nor can it access, other files stored in your personal Google Drive.

---

## 6. Security of Your Data

Although your data is local, Keel employs industry-leading security practices to protect your information on-disk and in-transit:

* **OS Secure Keyring Integration:** Credentials and API refresh tokens required for cloud sync are saved directly into your platform's native secure credential store (the Windows Credential Manager via secure system DPAPI calls). They are never saved in unencrypted config files.
* **Cryptographic Best Practices:** All Google OAuth 2.0 PKCE auth flows leverage cryptographically secure randomly generated local verifiers and SHA-256 code challenge methods.
* **Secure Transmissions:** All synchronization activities utilize secure SSL/TLS channels (HTTPS) to interact directly with Google's servers.

---

## 7. Cookies and Local Storage

* **Desktop Application:** The desktop application does not use internet cookies. It utilizes lightweight, local key-value storage (such as Tauri state or local settings files) strictly to preserve layout choices and offline UI preferences.
* **Web Landing Page:** The Keel informational website (`getkeel.com` or local landing portals) does not track your online activities or use targeting/marketing cookies. It uses strictly necessary local configurations (like dark/light theme choices) to render the web interface correctly.

---

## 8. Changes to This Privacy Statement

We may update this privacy statement from time to time to reflect changes in our desktop software architecture or legal compliance requirements. When we do, we will update the "Last Updated" date at the very top of this page. We encourage you to review this statement periodically to remain informed on how Keel safeguards your absolute privacy.

---

## 9. How to Contact Us

If you have questions, feedback, or concerns regarding your privacy while using Keel, or if you wish to review our open-source codebase to verify our privacy architecture, you can engage with us directly:

* **GitHub Repository:** Open an issue or review our open-source code at [github.com/Mukul-svg/keel-desktop](https://github.com/Mukul-svg/keel-desktop)
* **Email:** mukulraghav200369@gmail.com
