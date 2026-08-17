import { scanAssets, resolveAsset } from '../src/resolver/asset.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md++-asset-test-'));
}

describe('scanAssets', () => {
  test('returns empty array for nonexistent directory', () => {
    expect(scanAssets('/nonexistent/path')).toEqual([]);
  });

  test('scans files in flat directory', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'logo.png'), '');
    fs.writeFileSync(path.join(dir, 'readme.md'), '');
    const assets = scanAssets(dir);
    expect(assets.length).toBe(2);
    expect(assets.map(a => a.relativePath).sort()).toEqual(['logo.png', 'readme.md']);
    fs.rmSync(dir, { recursive: true });
  });

  test('recurses into subdirectories', () => {
    const dir = makeTmpDir();
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'top.svg'), '');
    fs.writeFileSync(path.join(dir, 'sub', 'nested.jpg'), '');
    const assets = scanAssets(dir);
    expect(assets.length).toBe(2);
    expect(assets.some(a => a.relativePath === 'top.svg')).toBe(true);
    expect(assets.some(a => a.relativePath === 'sub/nested.jpg')).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });

  test('classifies asset kinds', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'img.png'), '');
    fs.writeFileSync(path.join(dir, 'vid.mp4'), '');
    fs.writeFileSync(path.join(dir, 'doc.mdd'), '');
    const assets = scanAssets(dir);
    expect(assets.find(a => a.key === 'img.png')?.kind).toBe('image');
    expect(assets.find(a => a.key === 'vid.mp4')?.kind).toBe('video');
    expect(assets.find(a => a.key === 'doc.mdd')?.kind).toBe('mdd');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('resolveAsset', () => {
  test('resolves exact extension match', () => {
    const assets = [
      { key: 'logo.png', absolutePath: '/x/logo.png', relativePath: 'logo.png', kind: 'image' as const },
    ];
    const result = resolveAsset('logo.png', assets);
    expect(result?.relativePath).toBe('logo.png');
  });

  test('returns null when no match', () => {
    const assets = [
      { key: 'logo.png', absolutePath: '/x/logo.png', relativePath: 'logo.png', kind: 'image' as const },
    ];
    expect(resolveAsset('missing.svg', assets)).toBeNull();
  });

  test('probes extension order for no-extension str', () => {
    const assets = [
      { key: 'diagram.svg', absolutePath: '/x/diagram.svg', relativePath: 'diagram.svg', kind: 'image' as const },
    ];
    const result = resolveAsset('diagram', assets);
    expect(result?.relativePath).toBe('diagram.svg');
  });

  test('prefers earlier probe extension', () => {
    const assets = [
      { key: 'icon.jpg', absolutePath: '/x/icon.jpg', relativePath: 'icon.jpg', kind: 'image' as const },
      { key: 'icon.png', absolutePath: '/x/icon.png', relativePath: 'icon.png', kind: 'image' as const },
    ];
    const result = resolveAsset('icon', assets);
    expect(result?.relativePath).toBe('icon.png'); // .png comes before .jpg in probe order
  });

  test('resolves subdirectory path', () => {
    const assets = [
      { key: 'sub/img.gif', absolutePath: '/x/sub/img.gif', relativePath: 'sub/img.gif', kind: 'image' as const },
    ];
    const result = resolveAsset('sub/img.gif', assets);
    expect(result?.relativePath).toBe('sub/img.gif');
  });

  test('returns null for empty assets', () => {
    expect(resolveAsset('anything', [])).toBeNull();
  });
});
