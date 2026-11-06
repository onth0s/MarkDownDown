import { DIAGRAM as C } from '../../constants.js';
import { measureText } from '../text-metrics.js';
import type { DiagramModel } from './types.js';
import { assignRanks } from './dag.js';

export function diagramCompoundLayout(model: DiagramModel): void {
  function getAncestorInContainer(itemId: string, containerId?: string): string | null {
    if (model.subgraphs.has(itemId)) {
      let curr = model.subgraphs.get(itemId);
      if (curr?.parentId === containerId) return itemId;
      while (curr) {
        if (curr.parentId === containerId) return curr.id;
        curr = curr.parentId ? model.subgraphs.get(curr.parentId) : undefined;
      }
      return null;
    }
    let currSgId = model.nodeToSubgraph.get(itemId);
    if (currSgId === containerId) {
      return itemId;
    }
    if (!currSgId) {
      return containerId === undefined ? itemId : null;
    }
    while (currSgId) {
      const sg = model.subgraphs.get(currSgId);
      if (!sg) break;
      if (sg.parentId === containerId) {
        return sg.id;
      }
      currSgId = sg.parentId;
    }
    return null;
  }

  function runCompoundPass(isLR: boolean): void {
    const itemLocalPos = new Map<string, { x: number; y: number; top: number }>();

    function layoutContainer(containerId?: string): void {
      const childSubgraphs = [...model.subgraphs.values()].filter(sg => sg.parentId === containerId);
      for (const csg of childSubgraphs) {
        layoutContainer(csg.id);
      }

      const directNodes = [...model.nodes.values()].filter(
        n => model.nodeToSubgraph.get(n.id) === containerId
      );

      interface Item {
        id: string;
        w: number;
        h: number;
        isSubgraph: boolean;
      }
      const items: Item[] = [
        ...directNodes.map(n => ({ id: n.id, w: n.w, h: n.h, isSubgraph: false })),
        ...childSubgraphs.map(sg => ({
          id: sg.id,
          w: isLR ? (sg.lrW ?? sg.w) : sg.w,
          h: isLR ? (sg.lrH ?? sg.h) : sg.h,
          isSubgraph: true,
        })),
      ];

      if (items.length === 0) {
        if (containerId) {
          const sg = model.subgraphs.get(containerId)!;
          if (isLR) {
            sg.lrW = 120;
            sg.lrH = 60;
          } else {
            sg.w = 120;
            sg.h = 60;
          }
        }
        return;
      }

      const itemIds = new Set(items.map(it => it.id));
      const inducedEdges: Array<{ from: string; to: string }> = [];
      const edgeSet = new Set<string>();

      for (const e of model.edges) {
        const ancFrom = getAncestorInContainer(e.from, containerId);
        const ancTo = getAncestorInContainer(e.to, containerId);
        if (ancFrom && ancTo && ancFrom !== ancTo && itemIds.has(ancFrom) && itemIds.has(ancTo)) {
          const key = `${ancFrom}->${ancTo}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            inducedEdges.push({ from: ancFrom, to: ancTo });
          }
        }
      }

      const rankMap = new Map<string, number>();
      const visiting = new Set<string>();
      const assignItemRank = (id: string): number => {
        if (rankMap.has(id)) return rankMap.get(id)!;
        if (visiting.has(id)) return 0;
        visiting.add(id);
        let r = 0;
        for (const e of inducedEdges) {
          if (e.to === id && e.from !== id) {
            r = Math.max(r, assignItemRank(e.from) + 1);
          }
        }
        visiting.delete(id);
        rankMap.set(id, r);
        return r;
      };
      for (const it of items) assignItemRank(it.id);

      const itemRanks: string[][] = [];
      for (const it of items) {
        const r = rankMap.get(it.id)!;
        (itemRanks[r] ||= []).push(it.id);
      }

      for (let r = 1; r < itemRanks.length; r++) {
        const prevRow = itemRanks[r - 1];
        if (!prevRow) continue;
        const posMap = new Map<string, number>();
        prevRow.forEach((id, i) => posMap.set(id, i));

        const med = (id: string) => {
          const ps = inducedEdges
            .filter(e => e.to === id && posMap.has(e.from))
            .map(e => posMap.get(e.from)!)
            .sort((a, b) => a - b);
          if (!ps.length) return Infinity;
          const m = Math.floor(ps.length / 2);
          return ps.length % 2 ? ps[m] : (ps[m - 1] + ps[m]) / 2;
        };

        itemRanks[r].sort((a, b) => {
          const ma = med(a), mb = med(b);
          if (ma === Infinity && mb === Infinity) return 0;
          return ma - mb;
        });
      }

      const allNodes = items.every(it => !it.isSubgraph);
      if (allNodes && !isLR) {
        const isLinear = itemRanks.every(r => r.length === 1);
        const nonDiamonds = items.filter(it => model.nodes.get(it.id)?.shape !== 'diamond');
        if (isLinear && nonDiamonds.length > 0) {
          const maxW = Math.max(...nonDiamonds.map(it => it.w), C.MIN_W);
          for (const it of nonDiamonds) {
            it.w = maxW;
            model.nodes.get(it.id)!.w = maxW;
          }
        } else if (!isLinear) {
          for (const rid of itemRanks) {
            const rowNodes = rid.map(id => model.nodes.get(id)!).filter(n => n.shape !== 'diamond');
            if (rowNodes.length > 0) {
              const rowMaxW = Math.max(...rowNodes.map(n => n.w));
              for (const n of rowNodes) {
                n.w = rowMaxW;
                const it = items.find(x => x.id === n.id);
                if (it) it.w = rowMaxW;
              }
            }
          }
        }
      }

      const isTopLevel = containerId === undefined;
      const vGap = isTopLevel ? (isLR ? 28 : 60) : C.V_GAP;
      const hGap = isTopLevel ? (isLR ? 60 : 28) : C.H_GAP;
      const itemMap = new Map(items.map(it => [it.id, it]));

      if (!isLR) {
        let maxContentW = 0;
        const rowHeights: number[] = [];
        const rowWidths: number[] = [];

        for (let r = 0; r < itemRanks.length; r++) {
          const rowIds = itemRanks[r];
          const rowItems = rowIds.map(id => itemMap.get(id)!);
          const rowH = Math.max(...rowItems.map(it => it.h));
          const rowW = rowItems.reduce((sum, it) => sum + it.w + hGap, 0) - hGap;
          rowHeights.push(rowH);
          rowWidths.push(rowW);
          maxContentW = Math.max(maxContentW, rowW);
        }

        let curY = 0;
        for (let r = 0; r < itemRanks.length; r++) {
          const rowIds = itemRanks[r];
          const rowItems = rowIds.map(id => itemMap.get(id)!);
          const rowH = rowHeights[r];
          const rowW = rowWidths[r];
          let curX = (maxContentW - rowW) / 2;

          for (const it of rowItems) {
            const localX = curX + it.w / 2;
            const localTop = curY;
            const localY = curY + it.h / 2;
            itemLocalPos.set(it.id, { x: localX, y: localY, top: localTop });
            curX += it.w + hGap;
          }
          curY += rowH + vGap;
        }
        const totalContentH = curY - (itemRanks.length > 0 ? vGap : 0);

        if (containerId) {
          const sg = model.subgraphs.get(containerId)!;
          const PAD = 16;
          sg.headerH = 28;
          const titleW = measureText(sg.label, 12, { bold: true }) + 28;
          sg.w = Math.max(maxContentW + PAD * 2, titleW + PAD * 2);
          sg.h = Math.max(totalContentH + sg.headerH + PAD * 2, sg.headerH + 40);

          const xShift = (sg.w - maxContentW) / 2;
          const yShift = sg.headerH + PAD;
          for (const it of items) {
            const pos = itemLocalPos.get(it.id)!;
            itemLocalPos.set(it.id, {
              x: pos.x + xShift,
              y: pos.y + yShift,
              top: pos.top + yShift,
            });
          }
        } else {
          const ROOT_PAD = 40;
          model.maxX = maxContentW + ROOT_PAD * 2;
          model.maxY = totalContentH + ROOT_PAD * 2;
          for (const it of items) {
            const pos = itemLocalPos.get(it.id)!;
            itemLocalPos.set(it.id, {
              x: pos.x + ROOT_PAD,
              y: pos.y + ROOT_PAD,
              top: pos.top + ROOT_PAD,
            });
          }
        }
      } else {
        let maxContentH = 0;
        const colHeights: number[] = [];
        const colWidths: number[] = [];

        for (let r = 0; r < itemRanks.length; r++) {
          const colIds = itemRanks[r];
          const colItems = colIds.map(id => itemMap.get(id)!);
          const colW = Math.max(...colItems.map(it => it.w));
          const colH = colItems.reduce((sum, it) => sum + it.h + vGap, 0) - vGap;
          colWidths.push(colW);
          colHeights.push(colH);
          maxContentH = Math.max(maxContentH, colH);
        }

        let curX = 0;
        for (let r = 0; r < itemRanks.length; r++) {
          const colIds = itemRanks[r];
          const colItems = colIds.map(id => itemMap.get(id)!);
          const colW = colWidths[r];
          const colH = colHeights[r];
          let curY = (maxContentH - colH) / 2;

          for (const it of colItems) {
            const localX = curX + it.w / 2;
            const localTop = curY;
            const localY = curY + it.h / 2;
            itemLocalPos.set(it.id, { x: localX, y: localY, top: localTop });
            curY += it.h + vGap;
          }
          curX += colW + hGap;
        }
        const totalContentW = curX - (itemRanks.length > 0 ? hGap : 0);

        if (containerId) {
          const sg = model.subgraphs.get(containerId)!;
          const PAD = 16;
          sg.headerH = 28;
          const titleW = measureText(sg.label, 12, { bold: true }) + 28;
          sg.lrW = Math.max(totalContentW + PAD * 2, titleW + PAD * 2);
          sg.lrH = Math.max(maxContentH + sg.headerH + PAD * 2, sg.headerH + 40);

          const xShift = (sg.lrW - totalContentW) / 2;
          const yShift = sg.headerH + PAD;
          for (const it of items) {
            const pos = itemLocalPos.get(it.id)!;
            itemLocalPos.set(it.id, {
              x: pos.x + xShift,
              y: pos.y + yShift,
              top: pos.top + yShift,
            });
          }
        } else {
          const ROOT_PAD = 40;
          model.lrMaxX = totalContentW + ROOT_PAD * 2;
          model.lrMaxY = maxContentH + ROOT_PAD * 2;
          for (const it of items) {
            const pos = itemLocalPos.get(it.id)!;
            itemLocalPos.set(it.id, {
              x: pos.x + ROOT_PAD,
              y: pos.y + ROOT_PAD,
              top: pos.top + ROOT_PAD,
            });
          }
        }
      }
    }

    layoutContainer(undefined);

    function propagate(currContainerId?: string, originX = 0, originY = 0) {
      const directChildren = currContainerId === undefined
        ? [...model.nodes.values()].filter(n => !model.nodeToSubgraph.has(n.id))
        : [...model.nodes.values()].filter(n => model.nodeToSubgraph.get(n.id) === currContainerId);

      for (const n of directChildren) {
        const pos = itemLocalPos.get(n.id);
        if (pos) {
          const targetX = currContainerId === undefined ? pos.x : originX + pos.x;
          const targetY = currContainerId === undefined ? pos.y : originY + pos.y;
          if (isLR) {
            model.lrCx!.set(n.id, targetX);
            model.lrCy!.set(n.id, targetY);
          } else {
            model.cx.set(n.id, targetX);
            model.cy.set(n.id, targetY);
          }
        }
      }

      const directSubs = [...model.subgraphs.values()].filter(sg => sg.parentId === currContainerId);
      for (const sg of directSubs) {
        const pos = itemLocalPos.get(sg.id);
        if (pos) {
          const curW = isLR ? (sg.lrW ?? sg.w) : sg.w;
          const targetX = currContainerId === undefined ? pos.x - curW / 2 : originX + (pos.x - curW / 2);
          const targetY = currContainerId === undefined ? pos.top : originY + pos.top;
          if (isLR) {
            sg.lrX = targetX;
            sg.lrY = targetY;
          } else {
            sg.x = targetX;
            sg.y = targetY;
          }
          propagate(sg.id, targetX, targetY);
        }
      }
    }

    propagate(undefined, 0, 0);
  }

  model.horizontal = model.direction === 'LR' || model.direction === 'RL';
  model.lrCx = new Map();
  model.lrCy = new Map();
  model.lrGap = 60;

  runCompoundPass(false);
  runCompoundPass(true);

  const rank = assignRanks(model);
  const ranks: string[][] = [];
  for (const [id] of model.nodes) {
    const r = rank.get(id) ?? 0;
    (ranks[r] ||= []).push(id);
  }
  model.rank = rank;
  model.ranks = ranks;
}
