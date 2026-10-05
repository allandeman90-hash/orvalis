// Contrôles : Q/D (KeyA/KeyD) tournent caméra et personnage ; avec clic droit maintenu, pas de côté ; A/E (KeyQ/KeyE) pas de côté.
export default async ({ ev, wait }) => {
  await wait(800);
  const r = await ev(() => {
    const d = window.__dbg, G = d.G;
    d.quick('guerrier', 0, 5); d.tp(-300, 60);
    const P = G.player, out = {};
    const snap = () => ({ yaw: +G.cam.yaw.toFixed(2), ry: +P.ry.toFixed(2), x: +P.pos.x.toFixed(1), z: +P.pos.z.toFixed(1) });
    G.cam.yaw = 0; P.ry = 0; d.step(0.2);
    const a0 = snap();
    d.hold('KeyA'); d.step(1); d.hold('KeyA', false);
    out.turnLeft = { before: a0, after: snap() };
    const b0 = snap();
    d.hold('KeyD'); d.hold('KeyW'); d.step(1); d.hold('KeyD', false); d.hold('KeyW', false);
    out.turnRunRight = { before: b0, after: snap() };
    const c0 = snap();
    G.input.mouse.right = true; d.hold('KeyD'); d.step(1); d.hold('KeyD', false); G.input.mouse.right = false;
    out.strafeRmb = { before: c0, after: snap() };
    const e0 = snap();
    d.hold('KeyQ'); d.step(1); d.hold('KeyQ', false);
    out.strafeQ = { before: e0, after: snap() };
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
};
