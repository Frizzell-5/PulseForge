// Electron wrapper: serves the app from a private localhost server and opens it in a native window.
const { app, BrowserWindow, shell, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.normalize(path.join(ROOT, url === '/' ? 'app.html' : url));
      if (!file.startsWith(ROOT) || file.includes(`${path.sep}node_modules${path.sep}`)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function createWindow() {
  const port = await serve();
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0d0f17', title: 'PulseForge Studio', autoHideMenuBar: true,
    icon: path.join(ROOT, 'icons', 'icon-512.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Allow microphone + MIDI for recording and controllers
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'midi', 'midiSysex'].includes(perm)));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(`http://127.0.0.1:${port}/app.html`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
