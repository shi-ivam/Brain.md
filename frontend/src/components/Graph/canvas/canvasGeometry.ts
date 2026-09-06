import { GraphNode, GraphEdge, NodeType } from '../../../types';
import { TransformState } from './canvasTypes';

export const screenToWorld = (
  screenX: number,
  screenY: number,
  transform: TransformState
): { x: number; y: number } => {
  return {
    x: (screenX - transform.x) / transform.k,
    y: (screenY - transform.y) / transform.k,
  };
};

export const worldToScreen = (
  worldX: number,
  worldY: number,
  transform: TransformState
): { x: number; y: number } => {
  return {
    x: worldX * transform.k + transform.x,
    y: worldY * transform.k + transform.y,
  };
};

export const getNodeAtScreenPos = (
  screenX: number,
  screenY: number,
  simNodes: GraphNode[],
  transform: TransformState,
  activeFilters: Set<NodeType>
): GraphNode | null => {
  const worldPos = screenToWorld(screenX, screenY, transform);
  const { k } = transform;
  for (let i = simNodes.length - 1; i >= 0; i--) {
    const node = simNodes[i];
    if (!activeFilters.has(node.node_type)) continue;
    const dx = (node.x || 0) - worldPos.x;
    const dy = (node.y || 0) - worldPos.y;
    // Generous hit radius in world units (minimum 26 screen pixels)
    const hitRadius = Math.max(26 / k, (node.radius || 8) + 8 / k);
    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      return node;
    }
    // Also allow clicking node label right below the particle
    if (Math.abs(dx) <= 60 / k && dy < 0 && dy > -((node.radius || 8) + 24 / k)) {
      return node;
    }
  }
  return null;
};

export const getEdgeAtWorldPos = (
  worldX: number,
  worldY: number,
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
  transform: TransformState
): GraphEdge | null => {
  const { k } = transform;
  const threshold = 16 / k;

  for (let i = edges.length - 1; i >= 0; i--) {
    const edge = edges[i];
    const src = nodeMap.get(edge.source_id);
    const tgt = nodeMap.get(edge.target_id);
    if (!src || !tgt) continue;
    const x1 = src.x || 0;
    const y1 = src.y || 0;
    const x2 = tgt.x || 0;
    const y2 = tgt.y || 0;
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) continue;
    let t = ((worldX - x1) * (x2 - x1) + (worldY - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    const dist = Math.hypot(worldX - (x1 + t * (x2 - x1)), worldY - (y1 + t * (y2 - y1)));
    if (dist <= threshold) {
      return edge;
    }
  }
  return null;
};
