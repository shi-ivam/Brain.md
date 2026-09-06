import { GraphNode, GraphEdge, LayoutMode } from '../../../types';

/**
 * Initializes nodes with DAG depth tiers or restores positions from existing nodes
 */
export const initializeGraphNodes = (
  nodes: GraphNode[],
  edges: GraphEdge[],
  layoutMode: LayoutMode,
  existingSimNodes: GraphNode[],
  layoutChanged: boolean
): GraphNode[] => {
  const existingMap = new Map(existingSimNodes.map((n) => [n.id, n]));

  // Calculate node degree (number of connected edges)
  const degreeMap = new Map<string, number>();
  edges.forEach((e) => {
    degreeMap.set(e.source_id, (degreeMap.get(e.source_id) || 0) + 1);
    degreeMap.set(e.target_id, (degreeMap.get(e.target_id) || 0) + 1);
  });

  // Build adjacency map to calculate rightward depth from root
  const incomingMap = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!incomingMap.has(e.target_id)) incomingMap.set(e.target_id, []);
    incomingMap.get(e.target_id)!.push(e.source_id);
  });

  const depthMap = new Map<string, number>();
  const getDepth = (id: string, visited: Set<string> = new Set()): number => {
    if (depthMap.has(id)) return depthMap.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);

    const parents = incomingMap.get(id) || [];
    if (parents.length === 0) {
      depthMap.set(id, 0);
      return 0;
    }
    let maxParentDepth = 0;
    parents.forEach((pid) => {
      maxParentDepth = Math.max(maxParentDepth, getDepth(pid, new Set(visited)));
    });
    const d = maxParentDepth + 1;
    depthMap.set(id, d);
    return d;
  };

  nodes.forEach((n) => getDepth(n.id));

  // Group nodes by depth for vertical spread
  const depthGroups = new Map<number, string[]>();
  nodes.forEach((n) => {
    const d = depthMap.get(n.id) || 0;
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(n.id);
  });

  return nodes.map((node) => {
    const existing = existingMap.get(node.id);
    const degree = degreeMap.get(node.id) || 1;
    const radius = Math.max(6, Math.min(15, 6 + degree * 1.5));

    const depth = depthMap.get(node.id) || 0;
    const group = depthGroups.get(depth) || [node.id];
    const indexInGroup = group.indexOf(node.id);
    const totalInGroup = group.length;

    // Rightward tendency: start on the left (x=140) and step +260px right per tier
    const targetX = 140 + depth * 260;
    // Vertical spread: distributed around center (y=360)
    const verticalSpacing = Math.max(85, Math.min(130, 580 / Math.max(1, totalInGroup)));
    const targetY = 360 - ((totalInGroup - 1) * verticalSpacing) / 2 + indexInGroup * verticalSpacing;

    const isManual = node.pos_x !== undefined && node.pos_y !== undefined;
    const targetPosX = isManual ? node.pos_x! : (layoutMode === 'dag' ? targetX : (existing?.pos_x ?? targetX));
    const targetPosY = isManual ? node.pos_y! : (layoutMode === 'dag' ? targetY : (existing?.pos_y ?? targetY));

    if (existing && existing.x !== undefined && existing.y !== undefined) {
      const posChanged =
        isManual &&
        (existing.pos_x === undefined ||
          Math.abs(node.pos_x! - existing.pos_x) > 1 ||
          Math.abs(node.pos_y! - (existing.pos_y ?? 0)) > 1);

      return {
        ...node,
        x: existing.x,
        y: existing.y,
        vx: posChanged || layoutChanged ? 0 : (existing.vx || 0),
        vy: posChanged || layoutChanged ? 0 : (existing.vy || 0),
        pos_x: targetPosX,
        pos_y: targetPosY,
        radius,
      };
    }

    return {
      ...node,
      x: targetPosX,
      y: targetPosY,
      pos_x: targetPosX,
      pos_y: targetPosY,
      vx: 0,
      vy: 0,
      radius,
    };
  });
};

/**
 * Runs a single step of physics simulation for force or DAG layout
 */
export const stepPhysics = (
  simNodes: GraphNode[],
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
  layoutMode: LayoutMode,
  draggingNodeId?: string
): void => {
  if (layoutMode === 'dag') {
    // Academic Flow layout: smoothly ease nodes directly into their calculated/organized positions
    simNodes.forEach((node) => {
      if (draggingNodeId === node.id) {
        node.vx = 0;
        node.vy = 0;
        return;
      }

      const targetX = node.pos_x !== undefined ? node.pos_x : (node.x || 0);
      const targetY = node.pos_y !== undefined ? node.pos_y : (node.y || 0);

      const dx = targetX - (node.x || 0);
      const dy = targetY - (node.y || 0);

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        node.x = (node.x || 0) + dx * 0.18;
        node.y = (node.y || 0) + dy * 0.18;
      } else {
        node.x = targetX;
        node.y = targetY;
      }
      node.vx = 0;
      node.vy = 0;
    });
  } else {
    // Force Dynamic: Obsidian spring & repulsion physics simulation
    const numNodes = simNodes.length;
    const repulsion = 600;
    const springLength = 90;
    const springK = 0.035;
    const damping = 0.85;

    // 1. Node Repulsion
    for (let i = 0; i < numNodes; i++) {
      const n1 = simNodes[i];
      for (let j = i + 1; j < numNodes; j++) {
        const n2 = simNodes[j];
        const dx = (n2.x || 0) - (n1.x || 0);
        const dy = (n2.y || 0) - (n1.y || 0);
        const distSq = dx * dx + dy * dy + 10;
        const dist = Math.sqrt(distSq);
        if (dist < 320) {
          const force = repulsion / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          n1.vx = (n1.vx || 0) - fx;
          n1.vy = (n1.vy || 0) - fy;
          n2.vx = (n2.vx || 0) + fx;
          n2.vy = (n2.vy || 0) + fy;
        }
      }
    }

    // 2. Edge Springs
    edges.forEach((edge) => {
      const src = nodeMap.get(edge.source_id);
      const tgt = nodeMap.get(edge.target_id);
      if (src && tgt) {
        const dx = (tgt.x || 0) - (src.x || 0);
        const dy = (tgt.y || 0) - (src.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const displacement = dist - springLength;
        const force = displacement * springK;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        src.vx = (src.vx || 0) + fx;
        src.vy = (src.vy || 0) + fy;
        tgt.vx = (tgt.vx || 0) - fx;
        tgt.vy = (tgt.vy || 0) - fy;
      }
    });

    // 3. Update velocity & position
    simNodes.forEach((node) => {
      if (draggingNodeId === node.id) {
        node.vx = 0;
        node.vy = 0;
        return;
      }

      if (node.pos_x !== undefined) {
        const targetX = node.pos_x;
        node.vx = (node.vx || 0) + (targetX - (node.x || 0)) * 0.015;
      }

      node.vx = (node.vx || 0) * damping;
      node.vy = (node.vy || 0) * damping;

      // Cap speed
      const speed = Math.sqrt((node.vx || 0) ** 2 + (node.vy || 0) ** 2);
      if (speed > 12) {
        node.vx = ((node.vx || 0) / speed) * 12;
        node.vy = ((node.vy || 0) / speed) * 12;
      }

      node.x = (node.x || 0) + (node.vx || 0);
      node.y = (node.y || 0) + (node.vy || 0);
    });
  }
};
