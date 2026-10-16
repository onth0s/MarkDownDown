import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { diagramParse, diagramLayout, diagramBuildSvg } from '../src/renderer/diagram/index.js';

describe('Diagram Subgraphs & Arbitrary Nesting', () => {
  it('parses, lays out, and renders the picasso blueprint compound diagram', () => {
    const src = `
flowchart TD
    subgraph Config ["picasso-core (Config)"]
        Yaml["config.yaml\\nstats_overlay.enabled: true"] --> PicassoConfig
        PicassoConfig --> StatsOverlayConfig["StatsOverlayConfig {\\n  enabled: bool\\n}"]
    end

    subgraph Input ["picasso-viewer (Keymap & App Controller)"]
        KeyTab["Keyboard Tab Pressed"] --> KeymapDispatch["Keymap::dispatch_key"]
        KeymapDispatch --> AppActionTab["AppAction::ToggleStatsOverlay"]
        AppActionTab --> AppController["ViewerApp::handle_action"]
        AppController --> CheckConfig{"config.stats_overlay.enabled?"}
        CheckConfig -- No --> Ignore["Ignore (No-Op)"]
        CheckConfig -- Yes --> ToggleAnim["Start Reveal/Dismiss Animation\\n(opacity: 0.0 -> 1.0, y_offset: -12 -> 0)"]
    end

    subgraph UI ["picasso-ui (Layout & Tokens)"]
        AppController --> BuildStats["StatsOverlayLayout::compute(\\n  image_meta, viewport, index, count, theme\\n)"]
        BuildStats --> LayoutData["StatsOverlayLayout {\\n  bounds: Rect,\\n  rows: Vec<StatsRow>,\\n  opacity: f32\\n}"]
    end

    subgraph Render ["picasso-render (Tessellation & GPU Pass)"]
        LayoutData --> Tessellator["tessellate_stats_overlay()"]
        Tessellator --> VectorStrokeFont["Vector Stroke Font Table\\n(Full ASCII: A-Z, a-z, 0-9, symbols)"]
        VectorStrokeFont --> HudVertexBuffer["Dynamic HUD Vertex Buffer\\n(HudVertex)"]
        HudVertexBuffer --> RenderPipeline["hud_render_pipeline\\n(vs_hud, fs_hud WGSL)"]
    end
`;

    const model = diagramParse(src);
    expect(model.subgraphs.size).toBe(4);
    expect(model.subgraphs.has('Config')).toBe(true);
    expect(model.subgraphs.has('Input')).toBe(true);
    expect(model.subgraphs.has('UI')).toBe(true);
    expect(model.subgraphs.has('Render')).toBe(true);

    expect(model.nodeToSubgraph.get('Yaml')).toBe('Config');
    expect(model.nodeToSubgraph.get('PicassoConfig')).toBe('Config');
    expect(model.nodeToSubgraph.get('StatsOverlayConfig')).toBe('Config');

    expect(model.nodeToSubgraph.get('KeyTab')).toBe('Input');
    expect(model.nodeToSubgraph.get('AppController')).toBe('Input');
    expect(model.nodeToSubgraph.get('CheckConfig')).toBe('Input');
    expect(model.nodeToSubgraph.get('Ignore')).toBe('Input');
    expect(model.nodeToSubgraph.get('ToggleAnim')).toBe('Input');

    expect(model.nodeToSubgraph.get('BuildStats')).toBe('UI');
    expect(model.nodeToSubgraph.get('LayoutData')).toBe('UI');

    expect(model.nodeToSubgraph.get('Tessellator')).toBe('Render');
    expect(model.nodeToSubgraph.get('RenderPipeline')).toBe('Render');

    diagramLayout(model);

    const configSg = model.subgraphs.get('Config')!;
    const inputSg = model.subgraphs.get('Input')!;
    const uiSg = model.subgraphs.get('UI')!;
    const renderSg = model.subgraphs.get('Render')!;

    // Config and Input sit side-by-side at root rank 0, so their top Y is aligned
    expect(configSg.y).toBe(inputSg.y);
    expect(configSg.x).toBeLessThan(inputSg.x);

    // UI is downstream of Input, so UI sits below Input
    expect(uiSg.y).toBeGreaterThanOrEqual(inputSg.y + inputSg.h);

    // Render is downstream of UI, so Render sits below UI
    expect(renderSg.y).toBeGreaterThanOrEqual(uiSg.y + uiSg.h);

    // Every node has valid coordinates inside its subgraph bounds
    for (const [id] of model.nodes) {
      const cx = model.cx.get(id);
      const cy = model.cy.get(id);
      expect(cx).toBeDefined();
      expect(cy).toBeDefined();

      const sgId = model.nodeToSubgraph.get(id);
      if (sgId) {
        const sg = model.subgraphs.get(sgId)!;
        expect(cx!).toBeGreaterThanOrEqual(sg.x);
        expect(cx!).toBeLessThanOrEqual(sg.x + sg.w);
        expect(cy!).toBeGreaterThanOrEqual(sg.y);
        expect(cy!).toBeLessThanOrEqual(sg.y + sg.h);
      }
    }

    const svg = diagramBuildSvg(model, 'Picasso Blueprint');
    expect(svg).toContain('class="subgraph" data-id="Config"');
    expect(svg).toContain('class="subgraph" data-id="Input"');
    expect(svg).toContain('class="subgraph" data-id="UI"');
    expect(svg).toContain('class="subgraph" data-id="Render"');
    expect(svg).toContain('picasso-core (Config)');
    expect(svg).toContain('picasso-viewer (Keymap &amp; App Controller)');
    expect(svg).toContain('class="subgraph-hdr"');
    expect(svg).toContain('class="subgraph-body"');
    expect(svg).toContain('>Yes</text>');
    expect(svg).toContain('>No</text>');
  });

  it('supports arbitrary multi-level nested subgraphs', () => {
    const src = `
subgraph L1 ["Level 1 - Core"]
    subgraph L2 ["Level 2 - Module"]
        subgraph L3 ["Level 3 - Unit"]
            N1["Deep Leaf Node"]
            N2["Second Leaf Node"]
            N1 --> N2
        end
        N2 --> N3["Module Exit"]
    end
    N3 --> N4["Core Exit"]
end
`;

    const model = diagramParse(src);
    expect(model.subgraphs.size).toBe(3);
    const l1 = model.subgraphs.get('L1')!;
    const l2 = model.subgraphs.get('L2')!;
    const l3 = model.subgraphs.get('L3')!;

    expect(l1.parentId).toBeUndefined();
    expect(l2.parentId).toBe('L1');
    expect(l3.parentId).toBe('L2');

    expect(l1.subgraphIds.has('L2')).toBe(true);
    expect(l2.subgraphIds.has('L3')).toBe(true);

    expect(model.nodeToSubgraph.get('N1')).toBe('L3');
    expect(model.nodeToSubgraph.get('N2')).toBe('L3');
    expect(model.nodeToSubgraph.get('N3')).toBe('L2');
    expect(model.nodeToSubgraph.get('N4')).toBe('L1');

    diagramLayout(model);

    // Bounding containment: L1 contains L2, L2 contains L3, L3 contains N1 and N2
    expect(l2.x).toBeGreaterThanOrEqual(l1.x);
    expect(l2.x + l2.w).toBeLessThanOrEqual(l1.x + l1.w);
    expect(l2.y).toBeGreaterThanOrEqual(l1.y);
    expect(l2.y + l2.h).toBeLessThanOrEqual(l1.y + l1.h);

    expect(l3.x).toBeGreaterThanOrEqual(l2.x);
    expect(l3.x + l3.w).toBeLessThanOrEqual(l2.x + l2.w);
    expect(l3.y).toBeGreaterThanOrEqual(l2.y);
    expect(l3.y + l3.h).toBeLessThanOrEqual(l2.y + l2.h);

    const svg = diagramBuildSvg(model, 'Nested Diagram');
    // Ensure parent subgraphs are serialized before children in SVG markup
    const idxL1 = svg.indexOf('data-id="L1"');
    const idxL2 = svg.indexOf('data-id="L2"');
    const idxL3 = svg.indexOf('data-id="L3"');
    expect(idxL1).toBeLessThan(idxL2);
    expect(idxL2).toBeLessThan(idxL3);
  });

  it('inlines explicit presentation attributes on subgraph elements in 03-controls.js to prevent pitch-black rasterization', () => {
    const controlsJs = fs.readFileSync(path.resolve(process.cwd(), 'templates/app/03-controls.js'), 'utf8');

    // Ensure computed style sampling is registered for subgraphs
    expect(controlsJs).toContain("sampleSubgraphBody");
    expect(controlsJs).toContain("sampleSubgraphHdr");
    expect(controlsJs).toContain("sampleSubgraphTitle");

    // Ensure presentation attributes are inlined on cloned SVG
    expect(controlsJs).toContain("svgClone.querySelectorAll('.subgraph-body')");
    expect(controlsJs).toContain("svgClone.querySelectorAll('.subgraph-hdr')");
    expect(controlsJs).toContain("svgClone.querySelectorAll('.subgraph-title')");
    expect(controlsJs).toContain("el.setAttribute('fill', subgraphBodyFill)");
    expect(controlsJs).toContain("el.setAttribute('fill', subgraphHdrFill)");
    expect(controlsJs).toContain("el.setAttribute('fill', subgraphTitleFill)");
  });
});
