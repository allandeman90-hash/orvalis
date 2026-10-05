// Commandes de discussion (/g, /f, /inviter, /quitter, /danse…).
import { G } from './state.js';
import { Party } from './social.js';
import { Bots } from './bots.js';

export function runCommand(text) {
  const [cmd, ...rest] = text.slice(1).trim().split(/\s+/);
  const arg = rest.join(' ');
  const P = G.player;
  const c = (cmd || '').toLowerCase();
  switch (c) {
    case 'g': case 'groupe': case 'p':
      if (arg) { G.ui.chat('grp', P.name, arg, true); G.net?.sendChat('grp', arg); G.bots?.onPlayerChat?.(arg, 'grp'); }
      return;
    case 'f': case 'faction':
      if (arg) { G.ui.chat('fac', P.name, arg, true); G.net?.sendChat('fac', arg); G.bots?.onPlayerChat?.(arg, 'fac'); }
      return;
    case 'inviter': case 'invite': {
      let target = null;
      if (arg) {
        const rec = Bots.byName(arg);
        if (rec && rec.faction === P.faction) { Party.inviteBot(rec); G.ui.notify(`Invitation envoyée à ${rec.name}.`); return; }
        const rm = G.net && [...G.net.remotes.values()].find((r) => r.name.toLowerCase() === arg.toLowerCase());
        if (rm) { G.net.sendPartyInvite(rm); G.ui.notify(`Invitation envoyée à ${rm.name}.`); return; }
        G.ui.error('Joueur introuvable (ou hors ligne).');
        return;
      }
      target = P.target;
      if (!target || target.faction !== P.faction || !(target.kind === 'bot' || target.kind === 'remote')) { G.ui.error('Ciblez un joueur de votre faction, ou tapez /inviter Nom.'); return; }
      if (target.kind === 'bot') { Party.inviteBot(target.rec); G.ui.notify(`Invitation envoyée à ${target.name}.`); }
      else { G.net.sendPartyInvite(target); G.ui.notify(`Invitation envoyée à ${target.name}.`); }
      return;
    }
    case 'quitter': case 'leave':
      Party.leave();
      G.ui.notify('Vous avez quitté le groupe.');
      return;
    case 'danse': case 'dance':
      P.model.play('dance', 4); G.net?.sendEmote?.('dance');
      return;
    case 'salut': case 'wave':
      P.model.play('wave', 1.6); G.net?.sendEmote?.('wave');
      return;
    case 'rugir': case 'roar':
      P.model.play('roar', 1.2); G.net?.sendEmote?.('roar');
      return;
    case 'assis': case 'sit':
      P.model.sitting = !P.model.sitting;
      return;
    case 'aide': case 'help':
      G.win.open('help');
      return;
    case 'temps': case 'heure': {
      const t = G.sky.t;
      G.ui.log(`Heure d'Orvalis : ${String(Math.floor(t * 24)).padStart(2, '0')}:${String(Math.floor((t * 24 % 1) * 60)).padStart(2, '0')}`);
      return;
    }
    case 'qui': case 'who': {
      const rm = G.net ? [...G.net.remotes.values()] : [];
      G.ui.log(`Joueurs réels en ligne : ${rm.length ? rm.map((r) => r.name).join(', ') : 'aucun'}. Joueurs connectés au total : ${Bots.online().length + 1 + rm.length}.`);
      return;
    }
    default:
      G.ui.error('Commande inconnue. Tapez /aide.');
  }
}
