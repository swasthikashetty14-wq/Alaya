# Alaya — Yoga movement companion

A small, browser based hackathon prototype for webcam pose landmarks and real time movement feedback. It tracks 33 body landmarks with MediaPipe Pose Landmarker, draws the joints as dots and connecting lines, and estimates a 0–100 pose alignment score for Mountain, Tree, and Warrior II. Camera frames are processed in the browser and are not recorded or uploaded.

## Run it

1. Install Python 3 if it is not already installed.
2. Open Terminal and move into this folder. If you downloaded this workspace folder, use its path; for example:

   ```bash
   cd "/Users/swastitripathi/Documents/Codex/2026-11-14/s/work/yoga-companion"
   ```

3. Start a local web server:

   ```bash
   python3 -m http.server 8000
   ```

4. Open **http://localhost:8000** in Chrome or Safari. Allow camera access.
5. Stand far enough away that your full body fits in frame, select a pose, then press **Start camera**.

You need internet on first launch to load the MediaPipe JavaScript runtime and pose model from their CDNs. Camera access is restricted by browsers to `localhost` or HTTPS, so do not open `index.html` directly from Finder.

## What the score means

The score is a prototype heuristic based on approximate joint angles and landmark visibility, with pose specific checks. It is not a validated motor assessment and should not be presented as medical, diagnostic, or fitness advice. Webcam angle, lighting, body position, clothing, and device performance affect detection. Use an unobstructed full body view and move within a comfortable range.

## Files

- `index.html` — app layout and help dialog
- `style.css` — responsive visual design
- `app.js` — webcam, pose model, dots/skeleton, heuristics, score, and wellness check-in
