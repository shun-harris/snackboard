# 🍿 SnackBoard

A beautiful, minimal kanban board for quick "snack tasks" during coding breaks.

## 🌐 Live App
**Visit:** https://shun-harris.github.io/snackboard/

## 📱 Install as Mobile App (PWA)
1. Open the app on your phone
2. Tap "Share" (iOS) or "Menu" (Android)
3. Select "Add to Home Screen"
4. Works offline with cloud sync!

## 💻 Install as Desktop App

### Easiest: Chrome/Edge PWA (Auto-updates!)
1. Open https://shun-harris.github.io/snackboard/ in Chrome or Edge
2. Click the install icon (⊕) in the address bar
3. Click "Install"
4. **Automatically updates when you push to GitHub!**

### Advanced: Build Native .exe with Electron
Create a native desktop app that auto-updates from GitHub Pages:

```bash
mkdir snackboard-desktop && cd snackboard-desktop
npm init -y
npm install electron electron-builder

# Create main.js
echo 'const { app, BrowserWindow } = require("electron");
function createWindow() {
  const win = new BrowserWindow({ width: 1200, height: 800 });
  win.loadURL("https://shun-harris.github.io/snackboard/");
}
app.whenReady().then(createWindow);' > main.js

# Run it
npx electron .

# Or build .exe: npm install -g electron-builder && electron-builder
```

**This loads from GitHub Pages, so it auto-updates when you push code!**

## ✨ Features

- **Project-based organization** - Group tasks into projects with time tracking
- **Kanban workflow** - Backlog → Ready → Doing → Done
- **Built-in timer** - Track actual vs estimated time
- **Smart filtering** - Filter by labels and task size
- **Today's stats** - See your productivity at a glance
- **Dark mode** - Premium Apple/Stripe/Notion aesthetic
- **Drag & drop** - Smooth task management
- **Keyboard shortcuts** - Fast task creation (N key)
- **Local storage** - All data persists in your browser

## 🚀 Quick Start

1. Open `index.html` in your browser
2. Create a project (optional)
3. Add tasks with the "+ New Task" button
4. Start the timer and get coding!

## 🎨 Visual Design

- **Depth & Hierarchy** - Layered shadows and contrasting backgrounds
- **Premium interactions** - Smooth hover states and micro-animations
- **Modern typography** - Clear hierarchy with bold headers
- **Polished components** - Rounded corners, gradients, and glows
- **Empty states** - Helpful hints when columns are empty
- **Motion design** - Fade-ins, slides, and smooth transitions

## 💾 Data Persistence

All data is stored locally in your browser using localStorage. Your tasks, projects, and time tracking persist between sessions.

---

Built for developers who need to track small tasks during AI waits, builds, and deployments.