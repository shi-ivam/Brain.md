import { GraphNode, GraphEdge } from '../../../types';
import { TransformState, COLOR_MAP } from './canvasTypes';

export interface RenderMiniMapOptions {
  miniMapCanvas: HTMLCanvasElement;
  simNodes: GraphNode[];
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
  selectedNodeId?: string;
  transform: TransformState;
  mainWidth: number;
  mainHeight: number;
}

export const renderMiniMap = ({
  miniMapCanvas,
  simNodes,
  edges,
  nodeMap,
  selectedNodeId,
  transform,
  mainWidth,
  mainHeight,
}: RenderMiniMapOptions): void => {
  const mCtx = miniMapCanvas.getContext('2d');
  if (!mCtx) return;

  mCtx.clearRect(0, 0, 160, 110);
  mCtx.fillStyle = '#18181b';
  mCtx.fillRect(0, 0, 160, 110);

  if (simNodes.length === 0) return;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  simNodes.forEach((n) => {
    const nx = n.x ?? n.pos_x ?? 0;
    const ny = n.y ?? n.pos_y ?? 0;
    if (nx < minX) minX = nx;
    if (nx > maxX) maxX = nx;
    if (ny < minY) minY = ny;
    if (ny > maxY) maxY = ny;
  });

  const padding = 80;
  const bW = Math.max(100, maxX - minX + padding * 2);
  const bH = Math.max(80, maxY - minY + padding * 2);
  const scale = Math.min((160 - 16) / bW, (110 - 16) / bH);
  const offX = (160 - bW * scale) / 2;
  const offY = (110 - bH * scale) / 2;

  const toMini = (wx: number, wy: number) => ({
    x: offX + (wx - (minX - padding)) * scale,
    y: offY + (wy - (minY - padding)) * scale,
  });

  // Mini Edges
  mCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  mCtx.lineWidth = 0.8;
  edges.forEach((e) => {
    const s = nodeMap.get(e.source_id);
    const t = nodeMap.get(e.target_id);
    if (s && t) {
      const p1 = toMini(s.x || 0, s.y || 0);
      const p2 = toMini(t.x || 0, t.y || 0);
      mCtx.beginPath();
      mCtx.moveTo(p1.x, p1.y);
      mCtx.lineTo(p2.x, p2.y);
      mCtx.stroke();
    }
  });

  // Mini Nodes
  simNodes.forEach((n) => {
    const p = toMini(n.x || 0, n.y || 0);
    const isSel = n.id === selectedNodeId;
    mCtx.beginPath();
    mCtx.arc(p.x, p.y, isSel ? 3.5 : 2, 0, Math.PI * 2);
    mCtx.fillStyle = isSel ? '#38bdf8' : (COLOR_MAP[n.node_type]?.fill || '#a8a8b3');
    mCtx.fill();
  });

  // Mini Viewport Wireframe
  const { x: panX, y: panY, k } = transform;
  const vLeft = -panX / k;
  const vTop = -panY / k;
  const vW = mainWidth / k;
  const vH = mainHeight / k;

  const pTL = toMini(vLeft, vTop);
  const pBR = toMini(vLeft + vW, vTop + vH);
  const wBox = pBR.x - pTL.x;
  const hBox = pBR.y - pTL.y;

  mCtx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  mCtx.fillRect(pTL.x, pTL.y, wBox, hBox);
  mCtx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
  mCtx.lineWidth = 1.2;
  mCtx.strokeRect(pTL.x, pTL.y, wBox, hBox);
};

export const calculateMiniMapPan = (
  clientX: number,
  clientY: number,
  miniCanvas: HTMLCanvasElement,
  mainCanvas: HTMLCanvasElement,
  simNodes: GraphNode[],
  k: number
): { x: number; y: number } | null => {
  const rect = miniCanvas.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  if (simNodes.length === 0) return null;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  simNodes.forEach((n) => {
    const nx = n.x ?? n.pos_x ?? 0;
    const ny = n.y ?? n.pos_y ?? 0;
    if (nx < minX) minX = nx;
    if (nx > maxX) maxX = nx;
    if (ny < minY) minY = ny;
    if (ny > maxY) maxY = ny;
  });

  const padding = 80;
  const bW = Math.max(100, maxX - minX + padding * 2);
  const bH = Math.max(80, maxY - minY + padding * 2);
  const scale = Math.min((160 - 16) / bW, (110 - 16) / bH);
  const offX = (160 - bW * scale) / 2;
  const offY = (110 - bH * scale) / 2;

  const targetWorldX = minX - padding + (mx - offX) / scale;
  const targetWorldY = minY - padding + (my - offY) / scale;

  const newPanX = mainCanvas.clientWidth / 2 - targetWorldX * k;
  const newPanY = mainCanvas.clientHeight / 2 - targetWorldY * k;

  return { x: newPanX, y: newPanY };
};
