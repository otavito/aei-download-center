# AEI Download Center - Setup & Production Deployment

## Quick Start (Local Testing)

### Prerequisites
- Node.js + npm, or Python 3
- Azure Entra ID app registration

### 1. Install MSAL locally (if CDN blocking occurs)
```bash
npm install @azure/msal-browser
# Copy to project
mkdir -p libs
cp node_modules/@azure/msal-browser/dist/browser/msal-browser.min.js libs/
cp node_modules/@azure/msal-browser/dist/browser/msal-browser.min.js.map libs/
```

### 2. Run local server
```bash
# Python 3
python -m http.server 5500

# or Node with http-server
npx http-server -p 5500
```

Visit: `http://127.0.0.1:5500`

### 3. Configure Azure App Registration
- **Platform**: Single-page application (SPA)
- **Redirect URIs** (add all variants):
  - `http://127.0.0.1:5500/`
  - `http://localhost:5500/`
  - `https://your-static-web-app.azurestaticapps.net/`
- **API Permissions** (delegated):
  - User.Read
  - GroupMember.Read.All
  - Grant admin consent

### 4. File Structure
```
download_center/
├── index.html              # Main SPA with MSAL
├── auth-config.json        # Tenant/client config (safe to commit)
├── style.css               # UI styles
├── programs.json           # Programs data
├── libs/                   # (Optional) Local MSAL copy
│   └── msal-browser.min.js
└── README_SETUP.md         # This file
```

## MSAL Integration Summary

**Current Code Pattern:**
1. `loadAuthConfig()` - fetch `auth-config.json` and initialize msalInstance
2. `handleRedirectPromise()` - check for post-redirect accounts on page load
3. `login()` - call `msalInstance.loginRedirect()` to sign in
4. `logout()` - call `msalInstance.logoutRedirect()`
5. `checkGroupMembership()` - fetch `/me/memberOf` to validate group access

**Key Changes from Previous:**
- Removed `loginPopup()` (less reliable in production) → using `loginRedirect()` (redirect flow)
- Simplified script loading: MSAL is loaded via `<script src="...">` in `<head>` (not dynamic)
- Consolidated error messages via `showStatus()`
- All MSAL checks happen after `loadAuthConfig()` resolves

## Troubleshooting

### "msal is not defined" or "Cannot read properties of null"
- Check Network tab: is`msal-browser.min.js` loading? (status 200)
- If not: use local libs/ copy or check CDN/CSP/proxy
- Ensure `await loadAuthConfig()` completes before calling `login()`

### Redirect URI mismatch
- Error: "The redirect URI does not match..."
- Fix: Open Network tab, copy exact URL from address bar, register in Azure app

### Pop-up / Redirect not working
- `loginRedirect()` requires page refresh (full OAuth flow) → normal behavior
- After login, you'll be redirected back; `handleRedirectPromise()` runs again

### Group check fails (403 from Graph)
- Ensure admin granted `GroupMember.Read.All` consent
- Token scope matches: `["User.Read", "GroupMember.Read.All"]`
- Group ID in `auth-config.json` is correct

## Production Checklist
- [ ] `auth-config.json` committed (no secrets inside)
- [ ] Azure SPA redirect URI matches Deployed URL
- [ ] Admin consent granted for Graph scopes
- [ ] MSAL loaded from CDN or local (`libs/msal-browser.min.js`)
- [ ] `programs.json` accessible to authenticated users
- [ ] Help button Zendesk link is external (works cross-domain)
