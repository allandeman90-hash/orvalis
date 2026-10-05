// Clavier et souris. Déplacements et chiffres par position physique (e.code) : ZQSD et WASD fonctionnent tous deux.
// Seuls les champs de saisie de texte capturent le clavier : une case à cocher ou un curseur
// cliqué dans les options ne doit bloquer ni Échap, ni les raccourcis, ni les déplacements.
export function isTextField(e) {
  const t = e.target;
  const tag = (t && t.tagName) || '';
  if (tag === 'TEXTAREA') return true;
  if (tag === 'SELECT') return e.code !== 'Escape' && e.key !== 'Escape';
  if (tag !== 'INPUT') return !!(t && t.isContentEditable);
  return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color'].includes(t.type || 'text');
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, left: false, right: false, wheel: 0, dragDist: 0, downX: 0, downY: 0 };
    this.clicks = []; // {x,y,button}
    this.handlers = []; // fn(e) -> true si consommé
    this.typing = false;
    this.pointerOverUI = false;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.left = this.mouse.right = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      this.mouse.downX = e.clientX; this.mouse.downY = e.clientY; this.mouse.dragDist = 0;
      if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
      this.typing = false;
    });
    window.addEventListener('mouseup', (e) => {
      const wasL = this.mouse.left, wasR = this.mouse.right;
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      if (e.target === canvas && this.mouse.dragDist < 6 && ((e.button === 0 && wasL) || (e.button === 2 && wasR))) {
        this.clicks.push({ x: e.clientX, y: e.clientY, button: e.button });
      }
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.mouse.left || this.mouse.right) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
        this.mouse.dragDist += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
      }
    });
    canvas.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onKey(e, isDown) {
    const inField = isTextField(e);
    this.typing = inField;
    if (isDown) {
      for (const h of this.handlers) if (h(e)) { e.preventDefault(); return; }
    }
    if (inField) return;
    if (isDown) {
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code.startsWith('Digit') || e.code === 'Minus' || e.code === 'Equal') e.preventDefault();
    } else {
      this.down.delete(e.code);
    }
  }

  isDown(code) { return !this.typing && this.down.has(code); }
  wasPressed(code) { return !this.typing && this.pressed.has(code); }

  // f : avancer/reculer ; s : pas de côté ; t : tourner (caméra et personnage)
  // Q/D (A/D en QWERTY) tournent, comme dans les grands MMO ; clic droit maintenu : ils deviennent des pas de côté.
  // A/E (Q/E en QWERTY) font toujours des pas de côté.
  axis(keyTurn = true) {
    let f = 0, s = 0, t = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) f += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) f -= 1;
    let side = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) side -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) side += 1;
    if (keyTurn && !this.mouse.right) t = -side; else s = side;
    if (this.isDown('KeyQ')) s -= 1;
    if (this.isDown('KeyE')) s += 1;
    s = Math.max(-1, Math.min(1, s));
    if (this.mouse.left && this.mouse.right) f = 1; // avancer avec les deux boutons
    return { f, s, t };
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.clicks.length = 0;
  }
}
