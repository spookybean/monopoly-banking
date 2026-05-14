# Monopoly Bank India — GitHub Pages

Browser-only version of the digital banking app. No server, no hardware required.  
State is stored in `localStorage`; `properties.json` is fetched from the repo at runtime.

## Deploy to GitHub Pages

1. Push this repo to GitHub (if not already done).

2. Go to **Settings → Pages** in your repository.

3. Under **Build and deployment**, set:
   - **Source**: Deploy from a branch
   - **Branch**: `main` (or whichever branch you push to)
   - **Folder**: `/ (root)`

4. Click **Save**. GitHub will build and publish within ~1 minute.

5. Your app is live at:
   ```
   https://<your-username>.github.io/<repo-name>/gh-pages/
   ```

> **Tip:** Bookmark that URL — it's the only page you need during a game session.

## How `properties.json` is loaded

On startup the app tries these two URLs in order and uses the first that responds with valid JSON:

1. `./properties.json` — a file placed directly in `gh-pages/`
2. `../data/properties.json` — the board config already in the repo

Because GitHub Pages serves the entire repo, option 2 works out of the box with the default setup above. No extra steps needed.

If you want to use a custom board, either:
- Drag-and-drop your JSON onto the **Settings → Load Properties File** drop zone, or
- Paste a public URL into **Settings → Load from URL** (must be CORS-enabled).

## Local testing

```bash
# from the repo root — any static file server works
npx serve .
# then open http://localhost:3000/gh-pages/
```

Or use the existing Node.js dev server (it also serves `gh-pages/` as static files):

```bash
cd local-node && npm install && node server.js
# open http://localhost:3000/gh-pages/
```

## Save data

Game state persists in `localStorage` under the key `monopoly_gh_state`.

- **Export Save** (Settings tab) — downloads the state as `monopoly-save.json`. Use this to back up a game or move it to another device/browser.
- **Import Save** (Settings tab) — restores state from an exported file.
- Clearing browser storage or clicking **Reset Game** starts fresh.
