// Imitation locale de la capacité « room » (BroadcastChannel) pour tester le multijoueur à plusieurs onglets.
export function MockRoom() {
  const bc = new BroadcastChannel('orvalis-mockroom');
  const me = 'k' + Math.random().toString(36).slice(2, 12);
  let mine = {};
  const peers = new Map(); // peer -> {presence, updatedAt, seen}
  const listeners = [];
  let pending = { joined: [], left: [], updated: [] };
  let scheduled = false;

  const snap = () => {
    const out = [{ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() }];
    for (const [peer, p] of peers) out.push({ peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: p.presence, updatedAt: p.updatedAt });
    return out;
  };
  const flush = () => {
    scheduled = false;
    const ch = { peers: snap(), joined: pending.joined, left: pending.left, updated: pending.updated };
    pending = { joined: [], left: [], updated: [] };
    for (const l of listeners) l(ch);
  };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(flush); } };

  bc.onmessage = (ev) => {
    const m = ev.data;
    if (!m || m.peer === me) return;
    if (m.type === 'bye') {
      if (peers.has(m.peer)) { const p = peers.get(m.peer); peers.delete(m.peer); pending.left.push({ peer: m.peer, presence: p.presence }); schedule(); }
      return;
    }
    const known = peers.get(m.peer);
    const entry = { presence: m.presence || {}, updatedAt: Date.now(), seen: Date.now() };
    peers.set(m.peer, entry);
    const obj = { peer: m.peer, presence: entry.presence };
    if (known) pending.updated.push(obj); else { pending.joined.push(obj); bc.postMessage({ type: 'p', peer: me, presence: mine }); }
    schedule();
  };
  setInterval(() => {
    bc.postMessage({ type: 'p', peer: me, presence: mine });
    const now = Date.now();
    for (const [peer, p] of peers) if (now - p.seen > 15000) { peers.delete(peer); pending.left.push({ peer, presence: p.presence }); schedule(); }
  }, 1000);
  window.addEventListener('beforeunload', () => bc.postMessage({ type: 'bye', peer: me }));

  return {
    presence(patch) {
      const next = { ...mine };
      for (const k in patch) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
      mine = next;
      bc.postMessage({ type: 'p', peer: me, presence: mine });
      return Promise.resolve();
    },
    onPeers(fn) { listeners.push(fn); setTimeout(() => { pending.joined.push(...snap()); schedule(); }, 0); return () => {}; },
    peers() { return snap(); },
    connected() { return true; },
    onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
    emit() { return Promise.resolve(); },
    on() { return () => {}; },
  };
}
