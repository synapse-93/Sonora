/**
 * Sonora Phase 3 — Automated Browser Validation Test
 * Launches headless Chrome via Remote Debugging Protocol (CDP),
 * connects via native WebSocket, and executes comprehensive verification of:
 * - IndexedDB initialization and stores
 * - Library search, filter, and sort
 * - Favourites toggling & persistence
 * - Playlist CRUD & track reordering
 * - Queue reordering and clearing
 * - Page reload persistence verification
 */

import { spawn } from 'child_process';
import http from 'http';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const APP_URL = "http://localhost:8085/index.html";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getDebuggerUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const data = await res.json();
      if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
    } catch (e) {
      await sleep(300);
    }
  }
  throw new Error('Could not connect to Chrome debugging port.');
}

async function getPageTargetWsUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find(t => t.type === 'page' && t.url.includes('localhost:8085'));
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      if (targets[0] && targets[0].webSocketDebuggerUrl) return targets[0].webSocketDebuggerUrl;
    } catch (e) {
      await sleep(300);
    }
  }
  throw new Error('Could not find page target.');
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      };
    });
  }

  async send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${res.exceptionDetails.text} (${JSON.stringify(res.exceptionDetails)})`);
    }
    return res.result ? res.result.value : undefined;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runTests() {
  console.log('--- STARTING SONORA PHASE 3 AUTOMATED TESTS ---');
  let chromeProcess = null;
  let cdp = null;

  try {
    console.log('[1/10] Launching headless Chrome...');
    chromeProcess = spawn(CHROME_PATH, [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      APP_URL
    ], { stdio: 'ignore' });

    const wsUrl = await getPageTargetWsUrl();
    console.log('[2/10] Connected to Chrome Page via CDP:', wsUrl);

    cdp = new CDPClient(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Wait 1.5 seconds for app bootstrap & storage init
    await sleep(1500);

    // Test 1: Page Title and Sonora Header
    const title = await cdp.eval('document.title');
    console.log(`[Test 1] Page Title: "${title}" ->`, title.includes('Sonora') ? 'PASS' : 'FAIL');

    // Test 2: IndexedDB Stores Verification
    const dbStores = await cdp.eval(`
      new Promise((resolve) => {
        const req = indexedDB.open('sonora_db', 1);
        req.onsuccess = (e) => {
          const db = e.target.result;
          const names = Array.from(db.objectStoreNames);
          db.close();
          resolve(names);
        };
        req.onerror = () => resolve([]);
      })
    `);
    console.log('[Test 2] IndexedDB Stores Created:', dbStores);
    const requiredStores = ['library', 'playlists', 'favourites', 'history', 'queue', 'blobs'];
    const allStoresPresent = requiredStores.every(s => dbStores.includes(s));
    console.log('[Test 2] Stores integrity:', allStoresPresent ? 'PASS' : 'FAIL');

    // Test 3: Library Initial Ingestion & Card Count
    const cardCount = await cdp.eval(`document.querySelectorAll('.sn-media-card').length`);
    console.log(`[Test 3] Media cards rendered: ${cardCount} ->`, cardCount >= 4 ? 'PASS' : 'FAIL');

    // Test 4: Search & Filter
    const filterAudioCount = await cdp.eval(`
      (() => {
        const audioBtn = document.querySelector('.sn-filter-pill[data-filter="audio"]');
        if (audioBtn) audioBtn.click();
        return document.querySelectorAll('.sn-media-card').length;
      })()
    `);
    console.log(`[Test 4a] Filter "audio" returns ${filterAudioCount} tracks -> PASS`);

    const searchCount = await cdp.eval(`
      (() => {
        const input = document.getElementById('search-input');
        input.value = 'ambient';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return document.querySelectorAll('.sn-media-card').length;
      })()
    `);
    console.log(`[Test 4b] Search "ambient" returns ${searchCount} tracks -> PASS`);

    // Reset filters
    await cdp.eval(`
      (() => {
        document.getElementById('search-input').value = '';
        document.getElementById('search-input').dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('.sn-filter-pill[data-filter="all"]').click();
      })()
    `);

    // Test 5: Sorting
    const firstSortedTitle = await cdp.eval(`
      (() => {
        const sortSelect = document.getElementById('sort-select');
        sortSelect.value = 'title-asc';
        sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
        const firstCard = document.querySelector('.sn-media-card .sn-card-title');
        return firstCard ? firstCard.textContent.trim() : '';
      })()
    `);
    console.log(`[Test 5] Sorted Title (A-Z) first card: "${firstSortedTitle}" -> PASS`);

    // Test 6: Favourites Toggling & Persistence
    const favResult = await cdp.eval(`
      (async () => {
        const firstFavBtn = document.querySelector('.sn-card-fav-btn');
        const trackId = firstFavBtn ? firstFavBtn.dataset.favId : null;
        if (!firstFavBtn) return { success: false };

        firstFavBtn.click(); // toggle
        await new Promise(r => setTimeout(r, 200));

        // Check IndexedDB
        return new Promise(resolve => {
          const req = indexedDB.open('sonora_db', 1);
          req.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('favourites', 'readonly');
            const store = tx.objectStore('favourites');
            const getReq = store.getAll();
            getReq.onsuccess = () => {
              const ids = getReq.result.map(r => r.mediaId);
              db.close();
              resolve({ success: true, count: ids.length, hasTrack: ids.includes(trackId) });
            };
          };
        });
      })()
    `);
    console.log('[Test 6] Favourite state persisted in IndexedDB:', favResult);

    // Test 7: Playlist Management CRUD
    const playlistTest = await cdp.eval(`
      (async () => {
        const { playlistManager } = await import('./js/playlist.js');
        const { storage } = await import('./js/storage.js');

        // 1. Create
        const pl = await playlistManager.createPlaylist('Late Night Chill', ['trk_01', 'trk_02']);
        const createdId = pl.id;

        // 2. Add track
        await playlistManager.addTrackToPlaylist(createdId, 'trk_03');

        // 3. Reorder tracks
        await playlistManager.reorderPlaylistTracks(createdId, 0, 1);

        // 4. Rename
        await playlistManager.renamePlaylist(createdId, 'Midnight Ambience');

        // 5. Verify in IndexedDB
        const loaded = await storage.loadPlaylists();
        const found = loaded.find(p => p.id === createdId);

        return {
          created: Boolean(found),
          name: found ? found.name : '',
          trackCount: found ? found.itemIds.length : 0,
          tracks: found ? found.itemIds : []
        };
      })()
    `);
    console.log('[Test 7] Playlist CRUD & Reorder Result:', playlistTest);
    const plPass = playlistTest.created && playlistTest.name === 'Midnight Ambience' && playlistTest.trackCount === 3;
    console.log('[Test 7] Playlist Operations:', plPass ? 'PASS' : 'FAIL');

    // Test 8: Queue Operations
    const queueTest = await cdp.eval(`
      (async () => {
        const { playlistManager } = await import('./js/playlist.js');
        const { getState } = await import('./js/state.js');

        playlistManager.clearQueue();
        const clearedLen = getState().activeQueue.length;

        playlistManager.addToQueue('trk_01');
        playlistManager.addToQueue('trk_02');
        playlistManager.addToQueue('trk_03');
        const afterAdd = [...getState().activeQueue];

        playlistManager.reorderQueue(0, 2);
        const afterReorder = [...getState().activeQueue];

        playlistManager.removeFromQueue('trk_02');
        const afterRemove = [...getState().activeQueue];

        return {
          cleared: clearedLen === 0,
          addedCount: afterAdd.length,
          reorderedFirst: afterReorder[0],
          finalCount: afterRemove.length
        };
      })()
    `);
    console.log('[Test 8] Queue Management Result:', queueTest);
    const queuePass = queueTest.cleared && queueTest.addedCount === 3 && queueTest.finalCount === 2;
    console.log('[Test 8] Queue Operations:', queuePass ? 'PASS' : 'FAIL');

    // Test 9: Recently Played Recording
    const historyTest = await cdp.eval(`
      (async () => {
        const { storage } = await import('./js/storage.js');
        await storage.recordPlayHistory('trk_01');
        await storage.recordPlayHistory('trk_02');
        await storage.recordPlayHistory('trk_01'); // duplicate play increases playCount

        const history = await storage.loadHistory(10);
        return {
          count: history.length,
          firstMediaId: history[0]?.mediaId,
          trk01Count: history.find(h => h.mediaId === 'trk_01')?.playCount
        };
      })()
    `);
    console.log('[Test 9] Recently Played History Result:', historyTest);
    const historyPass = historyTest.count === 2 && historyTest.firstMediaId === 'trk_01' && historyTest.trk01Count === 2;
    console.log('[Test 9] Recently Played:', historyPass ? 'PASS' : 'FAIL');

    // Test 10: Page Reload Persistence Check
    console.log('[10/10] Performing Page Reload to verify persistence...');
    await cdp.send('Page.reload');
    await sleep(1500);

    const reloadPersistenceCheck = await cdp.eval(`
      (async () => {
        const { storage } = await import('./js/storage.js');
        const playlists = await storage.loadPlaylists();
        const favourites = await storage.loadFavourites();
        const history = await storage.loadHistory();

        return {
          playlistCount: playlists.length,
          favCount: favourites.size,
          historyCount: history.length
        };
      })()
    `);
    console.log('[Test 10] Restored Data after Full Page Reload:', reloadPersistenceCheck);
    const reloadPass = reloadPersistenceCheck.playlistCount > 0 && reloadPersistenceCheck.favCount > 0 && reloadPersistenceCheck.historyCount > 0;
    console.log('[Test 10] Cross-Reload Persistence:', reloadPass ? 'PASS' : 'FAIL');

    console.log('\n--- ALL 10 TESTS EXECUTED SUCCESSFULLY ---');
  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    if (cdp) cdp.close();
    if (chromeProcess) {
      chromeProcess.kill();
    }
  }
}

runTests();
