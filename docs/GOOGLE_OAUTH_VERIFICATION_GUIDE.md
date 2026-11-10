# Google OAuth App Verification Guide for Simple Streamer

This document contains everything required to pass Google's OAuth Verification Review and remove the **"Google hasn't verified this app"** warning for all public users.

---

## 1. Prerequisites Checklist

Before submitting the verification request in Google Cloud Console, ensure:

1. **Domain Ownership Verified:**
   - Go to [Google Search Console](https://search.google.com/search-console).
   - Ensure `bdjlmn.com` is added and verified under `midimahdi6@gmail.com`.
2. **Public Policy URLs Live:**
   - Home Page: `https://simple-streamer.bdjlmn.com`
   - Privacy Policy: `https://simple-streamer.bdjlmn.com/privacy`
   - Terms of Service: `https://simple-streamer.bdjlmn.com/terms`
3. **App Logo Asset:**
   - A 120×120 PNG image is ready at:
     `/Users/mahdi/Business/simple-streamer/docs/google-oauth-logo.png`

---

## 2. OAuth Consent Screen Form Values

Go to **[Google Cloud Console — OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)**:

| Field | Value to Enter |
|---|---|
| **App name** | `Simple Streamer` |
| **User support email** | `midimahdi6@gmail.com` |
| **App logo** | Upload `/Users/mahdi/Business/simple-streamer/docs/google-oauth-logo.png` |
| **App domain — Application home page** | `https://simple-streamer.bdjlmn.com` |
| **App domain — Privacy policy link** | `https://simple-streamer.bdjlmn.com/privacy` |
| **App domain — Terms of service link** | `https://simple-streamer.bdjlmn.com/terms` |
| **Authorized domains** | `bdjlmn.com` |
| **Developer contact email** | `midimahdi6@gmail.com` |

---

## 3. Scopes Configuration

Ensure the following scopes are added under **Scopes**:
1. `.../auth/youtube`
2. `.../auth/youtube.force-ssl`
3. `.../auth/userinfo.email`
4. `.../auth/userinfo.profile`
5. `openid`

---

## 4. Copy-Paste Written Justifications for Google Reviewers

When submitting the verification request, Google will prompt you with text boxes asking why you need each scope. Use these exact explanations:

### A. General Application Description:
```text
Simple Streamer is an open-source broadcasting utility embedded natively inside OBS Studio (Open Broadcaster Software). The application enables community broadcasters, non-profit institutions, and educational creators to stream live video directly to their authorized YouTube channel without requiring third-party restreaming services.
```

### B. Justification for `https://www.googleapis.com/auth/youtube`:
```text
Our application uses the YouTube Data API v3 liveBroadcasts and liveStreams endpoints to manage live broadcasts on behalf of the authenticated user.

Specifically:
1. When the user initiates a live stream inside the OBS Studio dock, the application calls `liveBroadcasts.insert` to create a live broadcast container with the title and description specified by the user.
2. It calls `liveStreams.list` / `liveStreams.insert` to retrieve the ingestion RTMP server URL and stream key for the user's channel.
3. It binds the broadcast container to the stream (`liveBroadcasts.bind`).
4. When the user ends the stream inside OBS Studio, it transitions the broadcast status to `complete` (`liveBroadcasts.transition`).

The application never reads, modifies, or deletes existing non-live videos, playlists, or comments.
```

### C. Justification for `https://www.googleapis.com/auth/youtube.force-ssl`:
```text
This scope is required to execute the `liveBroadcasts.transition` and `liveStreams` operations over a secured SSL connection to start and stop the broadcast stream lifecycle as mandated by the YouTube Live Streaming API.
```

### D. Data Storage & Privacy Statement:
```text
Simple Streamer adheres to a strictly stateless architecture. No user tokens, credentials, or personal information are ever stored on external databases or shared with third parties. All OAuth tokens are retained exclusively in the local client-side storage of the user's OBS Studio instance on their personal machine. Tokens can be deleted locally at any time via the dock settings.
```

---

## 5. Required YouTube Demo Video (60–90 Seconds)

Google **strictly requires** an unlisted YouTube video showing the complete user journey. 

### Mandatory Requirements:
1. **URL Bar Must Be Visible:** When the OAuth consent screen opens, the browser's address bar must be completely legible, showing the Google Cloud `client_id` (`259167398353-...`).
2. **Permission Grant:** Show clicking your account and accepting the requested YouTube permissions.
3. **In-App Usage:** Show returning to OBS Studio, entering a title in Simple Streamer, and clicking **GO LIVE**, verifying that the live stream container was created on YouTube.

### Quick Recording Script:
1. Start screen recording (OBS or QuickTime).
2. Open OBS Studio with the Simple Streamer dock visible.
3. Click **Add Platform → YouTube** (or Sign In).
4. Browser opens. **Zoom in slightly or ensure the URL bar is sharp and readable** showing `accounts.google.com/...client_id=259167398353...`.
5. Select your Google account and click **Continue / Allow**.
6. Switch back to OBS Studio: show that the YouTube channel is now connected with a green badge.
7. Enter a test title (e.g., `"Test Broadcast"`), and click **GO LIVE**.
8. Open YouTube Studio Live dashboard in your browser to show the stream starting.
9. Click **STOP STREAM** in OBS.
10. Stop recording, upload as **Unlisted** to YouTube, and paste the URL into the Google Cloud Console submission form.
