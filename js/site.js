// User page: download links, device detection and in-browser install.
(() => {
  // Change this one line if you fork the project.
  const REPO = 'Frizzell-5/PulseForge';
  const latest = name => `https://github.com/${REPO}/releases/latest/download/${name}`;

  document.querySelectorAll('[data-asset]').forEach(a => a.href = latest(a.dataset.asset));
  document.querySelectorAll('[data-repo]').forEach(a => a.href = `https://github.com/${REPO}`);

  // ----- device detection -----
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const os = /iPhone|iPad|iPod/.test(ua) || touchMac ? 'ios'
    : /Android/.test(ua) ? 'android'
    : /CrOS/.test(ua) ? 'chromeos'
    : /Windows/.test(ua) ? 'windows'
    : /Macintosh/.test(ua) ? 'mac'
    : /Linux/.test(ua) ? 'linux' : 'web';
  const names = { ios: 'iPhone / iPad', android: 'Android', chromeos: 'Chromebook', windows: 'Windows', mac: 'macOS', linux: 'Linux', web: 'your device' };

  const card = document.querySelector(`.dl[data-os="${os}"]`);
  if (card) {
    card.classList.add('recommended');
    card.parentNode.prepend(card);
    card.insertAdjacentHTML('afterbegin', '<span class="badge">Recommended for you</span>');
  }
  document.getElementById('detected').textContent = `Looks like you're on ${names[os]}. We've put the best option first.`;
  const hero = document.getElementById('heroDownload');
  if (['windows', 'mac', 'linux'].includes(os)) hero.textContent = `⬇ Download for ${names[os]}`;
  else if (os === 'ios') hero.textContent = '📱 Add to Home Screen';
  else if (os === 'android' || os === 'chromeos') hero.textContent = '⬇ Install app';

  // ----- install as an app (PWA) -----
  const state = document.getElementById('installState');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let prompt = null;
  const installBtns = document.querySelectorAll('.install-btn');

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    prompt = e;
    installBtns.forEach(b => b.hidden = false);
  });
  window.addEventListener('appinstalled', () => {
    state.textContent = '✅ Installed! Find PulseForge in your apps.';
    installBtns.forEach(b => b.hidden = true);
  });
  installBtns.forEach(b => b.addEventListener('click', async () => {
    if (prompt) {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      prompt = null;
      if (outcome === 'accepted') state.textContent = '✅ Installing…';
    } else if (os === 'ios') {
      state.textContent = 'On iPhone/iPad: open this page in Safari → Share → Add to Home Screen.';
    } else {
      state.textContent = 'Use your browser menu: ⋮ → "Install PulseForge" (or "Add to Home screen"). In Chrome/Edge on a computer, click the ⊕ icon in the address bar.';
    }
    state.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  if (standalone) state.textContent = '✅ You are using the installed app.';

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
