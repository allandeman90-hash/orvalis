import { describe, expect, it } from 'vitest';
import { CHARACTER_ATTACHMENTS, MANNEQUIN_SKELETON, buildAttachedModel } from '../../src/character';
import { validateAttachments, validateModelMesh } from '../../src/model';
import { NullBackend } from '../../src/renderer';
import { createModelScene } from '../../src/scenes/modelScene';
import { parseSceneRequest } from '../../src/scenes/select';

describe('Vanguard endgame appearance proof', () => {
  it('has valid head, shoulder, back and combat sockets', () => {
    expect(() => validateAttachments(CHARACTER_ATTACHMENTS, MANNEQUIN_SKELETON.bones.length)).not.toThrow();
    expect(CHARACTER_ATTACHMENTS.map((a) => a.name)).toEqual(['rightHand', 'leftForearm', 'head', 'leftShoulder', 'rightShoulder', 'back']);
  });

  it('builds every unique attached Vanguard model', () => {
    for (const key of ['vanguardHelm', 'vanguardPauldron', 'vanguardCape', 'runeblade', 'towerShield'] as const) {
      expect(() => validateModelMesh(buildAttachedModel(key))).not.toThrow();
    }
  });

  it('selects the preset from the URL and renders a six-piece attached silhouette', () => {
    expect(parseSceneRequest('?scene=model&model=character&preset=vanguard&anim=stand')).toMatchObject({ scene: 'model', model: 'character', preset: 'vanguard' });
    const backend = new NullBackend();
    const scene = createModelScene(backend, { model: 'character', preset: 'vanguard', animation: 'off' });
    const frame = scene.render(16 / 9);
    expect(frame.drawCalls).toBe(9); // body + gloves + boots + 6 attached pieces; hair hidden by helm
    expect(scene.models).toMatchObject({ outfit: -1, attached: 6, models: 6 });
    expect(new Set(scene.models.equipment)).toEqual(new Set(['linen-shirt', 'cloth-trousers', 'leather-vest', 'leather-boots', 'leather-gloves', 'belt', 'vanguard-helm', 'vanguard-shoulders', 'vanguard-cape', 'runeblade', 'tower-shield']));
    expect(scene.instances[0]!.hiddenGeosets!.has(1)).toBe(true); // selected hair hidden under full helm
    scene.dispose();
    expect([backend.liveBufferCount, backend.liveTextureCount, backend.livePipelineCount]).toEqual([0, 0, 0]);
  });
});
