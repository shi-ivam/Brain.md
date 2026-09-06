import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  GraphNode,
  GraphEdge,
  LayoutMode,
  NodeType,
  DifficultyLevel,
  ShortestPathResult,
} from '../../types';
import { NodePlusPopover } from './NodePlusPopover';
import { NodeContextMenu } from './NodeContextMenu';

export interface KnowledgeGraphCanvasHandle {
  fitGraph: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface KnowledgeGraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layoutMode: LayoutMode;
  selectedNodeId?: string;
  onSelectNode: (node: GraphNode) => void;
  onOpenAction: (
    action:
      | 'add_question'
      | 'add_note'
      | 'generate_quiz'
      | 'expand_subtopics'
      | 'decompose_question'
      | 'subquestions'
      | 'tested_concepts',
    node: GraphNode
  ) => void;
  difficulty: DifficultyLevel;
  searchFilter: string;
  activeFilters: Set<NodeType>;
  onDeleteNode?: (nodeId: string) => void;
  onNodePositionChange?: (nodeId: string, posX: number, posY: number) => void;
  onSynthesizeNote?: (node: GraphNode) => void;
  onDecomposeQuestion?: (nodeId: string) => void;
  onOpenQuiz?: (node: GraphNode) => void;
  onToggleDone?: (node: GraphNode) => void;
  // Features 4, 14, 16, 20, 21, 22, 23
  lensMode?: 'all' | '1-hop' | '2-hop';
  shortestPath?: ShortestPathResult | null;
  colorMode?: 'default' | 'heatmap';
  showMiniMap?: boolean;
  onSelectEdge?: (edge: GraphEdge) => void;
  selectedCommunityNodeIds?: Set<string> | null;
}

const COLOR_MAP: Record<NodeType, { fill: string; glow: string; text: string }> = {
  concept: { fill: '#bfa4f8', glow: 'rgba(191, 164, 248, 0.4)', text: '#e5d9fd' },
  prerequisite: { fill: '#f87171', glow: 'rgba(248, 113, 113, 0.4)', text: '#fca5a5' },
  subtopic: { fill: '#a8a8b3', glow: 'rgba(168, 168, 179, 0.3)', text: '#d1d1d8' },
  question: { fill: '#7dd3fc', glow: 'rgba(125, 211, 252, 0.4)', text: '#bae6fd' },
  quiz: { fill: '#fde047', glow: 'rgba(253, 224, 71, 0.4)', text: '#fef08a' },
  note: { fill: '#6ee7b7', glow: 'rgba(110, 231, 183, 0.4)', text: '#a7f3d0' },
};

const getHeatmapColor = (score: number) => {
  if (score === 0) return { fill: '#7f1d1d', glow: 'rgba(127, 29, 29, 0.6)', text: '#fca5a5' };
  if (score <= 30) return { fill: '#b45309', glow: 'rgba(180, 83, 9, 0.6)', text: '#fde047' };
  if (score <= 70) return { fill: '#0284c7', glow: 'rgba(2, 132, 199, 0.6)', text: '#bae6fd' };
  return { fill: '#059669', glow: 'rgba(5, 150, 105, 0.6)', text: '#a7f3d0' };
};

export const KnowledgeGraphCanvas = forwardRef<KnowledgeGraphCanvasHandle, KnowledgeGraphCanvasProps>(
  (
    {
      nodes,
      edges,
      layoutMode,
      selectedNodeId,
      onSelectNode,
      onOpenAction,
      difficulty,
      searchFilter,
      activeFilters,
      onDeleteNode,
      onNodePositionChange,
      onSynthesizeNote,
      onDecomposeQuestion,
      onOpenQuiz,
      onToggleDone,
      lensMode = 'all',
      shortestPath = null,
      colorMode = 'default',
      showMiniMap = true,
      onSelectEdge,
      selectedCommunityNodeIds = null,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniMapRef = useRef<HTMLCanvasElement | null>(null);

  // Transform: Pan & Zoom
  const transformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  // Camera auto-focus target
  const cameraTargetRef = useRef<{ x: number; y: number } | null>(null);
  const prevSelectedNodeIdRef = useRef<string | undefined>(undefined);
  const isMiniMapDraggingRef = useRef(false);

  // Physics simulation state (mutable for 60fps performance)
  const simNodesRef = useRef<GraphNode[]>([]);
  const draggingNodeRef = useRef<GraphNode | null>(null);
  const isPanningRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const hoveredNodeRef = useRef<GraphNode | null>(null);

  // Plus button popover state
  const [plusPopover, setPlusPopover] = useState<{ node: GraphNode; x: number; y: number } | null>(null);
  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{ node: GraphNode; x: number; y: number } | null>(null);

  const lastLayoutModeRef = useRef<LayoutMode>(layoutMode);

  // Smoothly center camera on selected node when selectedNodeId changes
  useEffect(() => {
    if (selectedNodeId && selectedNodeId !== prevSelectedNodeIdRef.current) {
      const target = simNodesRef.current.find((n) => n.id === selectedNodeId);
      if (target && target.x !== undefined && target.y !== undefined) {
        cameraTargetRef.current = { x: target.x, y: target.y };
      }
    }
    prevSelectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  // Initialize simulation positions based on layoutMode
  useEffect(() => {
    const layoutChanged = lastLayoutModeRef.current !== layoutMode;
    lastLayoutModeRef.current = layoutMode;
    const existingMap = new Map(simNodesRef.current.map((n) => [n.id, n]));
    
    // Calculate node degree (number of connected edges)
    const degreeMap = new Map<string, number>();
    edges.forEach((e) => {
      degreeMap.set(e.source_id, (degreeMap.get(e.source_id) || 0) + 1);
      degreeMap.set(e.target_id, (degreeMap.get(e.target_id) || 0) + 1);
    });

    // 1. Build adjacency map to calculate rightward depth from root
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

    const initialized: GraphNode[] = nodes.map((node) => {
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

    simNodesRef.current = initialized;
  }, [nodes, edges, layoutMode]);

  // Center / Fit Graph
  const fitGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || simNodesRef.current.length === 0) return;
    const simNodes = simNodesRef.current;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    simNodes.forEach((n) => {
      const x = n.pos_x !== undefined ? n.pos_x : (n.x || 0);
      const y = n.pos_y !== undefined ? n.pos_y : (n.y || 0);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });

    const padding = 120;
    const graphWidth = Math.max(100, maxX - minX + padding * 2);
    const graphHeight = Math.max(100, maxY - minY + padding * 2);

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / graphWidth;
    const scaleY = rect.height / graphHeight;
    const k = Math.max(0.35, Math.min(1.2, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const newX = rect.width / 2 - centerX * k;
    const newY = rect.height / 2 - centerY * k;

    cameraTargetRef.current = null;
    transformRef.current = { x: newX, y: newY, k };
    setTransform({ x: newX, y: newY, k });
  }, []);

  const zoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const current = transformRef.current;
    const newK = Math.max(0.2, Math.min(3.0, current.k * 1.25));
    const newX = centerX - (centerX - current.x) * (newK / current.k);
    const newY = centerY - (centerY - current.y) * (newK / current.k);
    cameraTargetRef.current = null;
    transformRef.current = { x: newX, y: newY, k: newK };
    setTransform({ x: newX, y: newY, k: newK });
  }, []);

  const zoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const current = transformRef.current;
    const newK = Math.max(0.2, Math.min(3.0, current.k * 0.8));
    const newX = centerX - (centerX - current.x) * (newK / current.k);
    const newY = centerY - (centerY - current.y) * (newK / current.k);
    cameraTargetRef.current = null;
    transformRef.current = { x: newX, y: newY, k: newK };
    setTransform({ x: newX, y: newY, k: newK });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fitGraph,
      zoomIn,
      zoomOut,
    }),
    [fitGraph, zoomIn, zoomOut]
  );

  // Center graph initially when first loaded
  useEffect(() => {
    if (nodes.length > 0) {
      setTimeout(fitGraph, 100);
    }
  }, [nodes.length === 0]);

  // High-performance physics simulation & Canvas render loop
  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodeMap = new Map<string, GraphNode>();

    const render = () => {
      const simNodes = simNodesRef.current;
      nodeMap.clear();
      simNodes.forEach((n) => nodeMap.set(n.id, n));

      // --- Physics Step ---
      if (layoutMode === 'dag') {
        // Academic Flow layout: smoothly ease nodes directly into their calculated/organized positions
        simNodes.forEach((node) => {
          if (draggingNodeRef.current?.id === node.id) {
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
          if (draggingNodeRef.current?.id === node.id) {
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

      // --- Target Node Focus Camera Interpolation ---
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (
        cameraTargetRef.current &&
        !isPanningRef.current &&
        !draggingNodeRef.current &&
        !isMiniMapDraggingRef.current
      ) {
        const k = transformRef.current.k;
        const targetPanX = width / 2 - cameraTargetRef.current.x * k;
        const targetPanY = height / 2 - cameraTargetRef.current.y * k;
        const dx = targetPanX - transformRef.current.x;
        const dy = targetPanY - transformRef.current.y;
        if (Math.abs(dx) > 0.8 || Math.abs(dy) > 0.8) {
          transformRef.current.x += dx * 0.1;
          transformRef.current.y += dy * 0.1;
          setTransform({ ...transformRef.current });
        } else {
          transformRef.current.x = targetPanX;
          transformRef.current.y = targetPanY;
          setTransform({ ...transformRef.current });
          cameraTargetRef.current = null;
        }
      }

      // --- Drawing Step ---
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Apply pan & zoom
      const { x: panX, y: panY, k } = transformRef.current;
      ctx.translate(panX, panY);
      ctx.scale(k, k);

      // Draw subtle grid dots (Obsidian background feel)
      ctx.fillStyle = '#222226';
      const gridSize = 40;
      const startX = Math.floor(-panX / k / gridSize) * gridSize;
      const endX = Math.ceil((-panX + width) / k / gridSize) * gridSize;
      const startY = Math.floor(-panY / k / gridSize) * gridSize;
      const endY = Math.ceil((-panY + height) / k / gridSize) * gridSize;

      for (let gx = startX; gx <= endX; gx += gridSize) {
        for (let gy = startY; gy <= endY; gy += gridSize) {
          ctx.fillRect(gx - 0.5, gy - 0.5, 1, 1);
        }
      }

      const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
      const hoveredNode = hoveredNodeRef.current;

      // Calculate Lens Neighborhood Set (1-hop or 2-hop)
      const lensNodeIds = new Set<string>();
      if (selectedNode && lensMode !== 'all') {
        lensNodeIds.add(selectedNode.id);
        edges.forEach((e) => {
          if (e.source_id === selectedNode.id) lensNodeIds.add(e.target_id);
          if (e.target_id === selectedNode.id) lensNodeIds.add(e.source_id);
        });
        if (lensMode === '2-hop') {
          const hop1 = new Set(lensNodeIds);
          edges.forEach((e) => {
            if (hop1.has(e.source_id)) lensNodeIds.add(e.target_id);
            if (hop1.has(e.target_id)) lensNodeIds.add(e.source_id);
          });
        }
      }

      // Draw Edges
      edges.forEach((edge) => {
        const src = nodeMap.get(edge.source_id);
        const tgt = nodeMap.get(edge.target_id);
        if (!src || !tgt) return;

        // Check if filtered
        if (!activeFilters.has(src.node_type) || !activeFilters.has(tgt.node_type)) return;

        const isHighlighted =
          (selectedNode && (src.id === selectedNode.id || tgt.id === selectedNode.id)) ||
          (hoveredNode && (src.id === hoveredNode.id || tgt.id === hoveredNode.id));

        const edgeInLens =
          lensMode === 'all' ||
          !selectedNode ||
          (lensNodeIds.has(edge.source_id) && lensNodeIds.has(edge.target_id));

        ctx.save();
        ctx.globalAlpha = edgeInLens ? 1.0 : 0.05;

        ctx.beginPath();
        ctx.moveTo(src.x || 0, src.y || 0);
        ctx.lineTo(tgt.x || 0, tgt.y || 0);

        if (isHighlighted) {
          ctx.strokeStyle = '#8b7bf5';
          ctx.lineWidth = 1.8 / k;
          ctx.shadowColor = 'rgba(139, 123, 245, 0.4)';
          ctx.shadowBlur = 6;
        } else {
          ctx.strokeStyle = '#2d2d35';
          ctx.lineWidth = 1 / k;
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Directed subtle arrow
        const dx = (tgt.x || 0) - (src.x || 0);
        const dy = (tgt.y || 0) - (src.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 20) {
          const tgtRadius = tgt.radius || 8;
          const arrowX = (tgt.x || 0) - (dx / dist) * (tgtRadius + 4);
          const arrowY = (tgt.y || 0) - (dy / dist) * (tgtRadius + 4);
          const angle = Math.atan2(dy, dx);

          ctx.save();
          ctx.translate(arrowX, arrowY);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-6 / k, -3 / k);
          ctx.lineTo(-6 / k, 3 / k);
          ctx.closePath();
          ctx.fillStyle = isHighlighted ? '#8b7bf5' : '#3c3c46';
          ctx.fill();
          ctx.restore();
        }

        // Feature 23: Canvas Edge Labels (zoom >= 0.75)
        const labelText = edge.label || (edge.edge_type && edge.edge_type !== 'related_to' ? edge.edge_type : '');
        if (k >= 0.75 && labelText && edgeInLens) {
          const midX = ((src.x || 0) + (tgt.x || 0)) / 2;
          const midY = ((src.y || 0) + (tgt.y || 0)) / 2;
          let labelAngle = Math.atan2(dy, dx);
          if (labelAngle > Math.PI / 2 || labelAngle < -Math.PI / 2) {
            labelAngle += Math.PI;
          }

          ctx.save();
          ctx.translate(midX, midY);
          ctx.rotate(labelAngle);
          ctx.font = `${Math.max(9, 10 / k)}px Geist Mono, monospace`;
          const textMetrics = ctx.measureText(labelText);
          const padH = 4 / k;
          const padV = 2 / k;
          const boxW = textMetrics.width + padH * 2;
          const boxH = 12 / k;

          ctx.fillStyle = 'rgba(20, 20, 24, 0.85)';
          ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 0.8 / k;
          ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

          ctx.fillStyle = isHighlighted ? '#c4b5fd' : '#94a3b8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, 0, 0);
          ctx.restore();
        }

        ctx.restore();
      });

      // Feature 16: Shortest Path Trail (animated golden dashed trail with pulsing arrows)
      if (shortestPath && shortestPath.found && shortestPath.node_ids.length >= 2) {
        ctx.save();
        const nowTime = performance.now();
        const dashOffset = -(nowTime / 22) % 24;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.8 / k;
        ctx.setLineDash([8 / k, 4 / k]);
        ctx.lineDashOffset = dashOffset;
        ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
        ctx.shadowBlur = 10;

        for (let i = 0; i < shortestPath.node_ids.length - 1; i++) {
          const u = nodeMap.get(shortestPath.node_ids[i]);
          const v = nodeMap.get(shortestPath.node_ids[i + 1]);
          if (u && v) {
            ctx.beginPath();
            ctx.moveTo(u.x || 0, u.y || 0);
            ctx.lineTo(v.x || 0, v.y || 0);
            ctx.stroke();

            // Pulsing directional arrow along segment
            const dx = (v.x || 0) - (u.x || 0);
            const dy = (v.y || 0) - (u.y || 0);
            const dist = Math.hypot(dx, dy);
            if (dist > 20) {
              const tProgress = (nowTime / 1000 + i * 0.25) % 1;
              const ax = (u.x || 0) + dx * tProgress;
              const ay = (u.y || 0) + dy * tProgress;
              const angle = Math.atan2(dy, dx);
              ctx.save();
              ctx.translate(ax, ay);
              ctx.rotate(angle);
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(-7 / k, -3.5 / k);
              ctx.lineTo(-7 / k, 3.5 / k);
              ctx.closePath();
              ctx.fillStyle = '#fbbf24';
              ctx.shadowColor = '#fbbf24';
              ctx.shadowBlur = 6;
              ctx.fill();
              ctx.restore();
            }
          }
        }
        ctx.restore();
      }

      // Draw Nodes
      simNodes.forEach((node) => {
        if (!activeFilters.has(node.node_type)) return;

        const nx = node.x || 0;
        const ny = node.y || 0;
        const r = node.radius || 8;
        const isSelected = node.id === selectedNodeId;
        const isHovered = hoveredNode?.id === node.id;
        const isPathNode = shortestPath && shortestPath.found && shortestPath.node_ids.includes(node.id);
        const nodeInLens = lensMode === 'all' || !selectedNode || lensNodeIds.has(node.id);

        const matchesSearch =
          !searchFilter ||
          node.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
          (node.summary && node.summary.toLowerCase().includes(searchFilter.toLowerCase()));

        // Color selection: Heatmap vs Default
        const score = Math.max(0, Math.min(100, node.mastery_score || 0));
        const baseStyle = COLOR_MAP[node.node_type] || COLOR_MAP.concept;
        const heatmapStyle = getHeatmapColor(score);
        const style = colorMode === 'heatmap' ? heatmapStyle : baseStyle;

        const inCommunity = !selectedCommunityNodeIds || selectedCommunityNodeIds.has(node.id);
        const isVisible = nodeInLens && inCommunity;

        ctx.save();
        ctx.globalAlpha = isVisible ? 1.0 : 0.12;

        // Community module halo accent
        if (selectedCommunityNodeIds && inCommunity) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(nx, ny, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5 / k;
          ctx.stroke();
          ctx.restore();
        }

        // Feature: Node completed indicator glow/ring
        if (node.is_done) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(nx, ny, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.8 / k;
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 8;
          ctx.stroke();
          ctx.restore();
        }

        // Feature 16: Shortest path golden glow
        if (isPathNode) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(nx, ny, r + 7, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.4)';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.restore();
        }

        // Feature 15: Portal Node Indicator (swirling orbital rings)
        if (node.portal_topic_id) {
          const swirlT = (performance.now() / 600) % (Math.PI * 2);
          ctx.save();
          ctx.translate(nx, ny);
          ctx.rotate(swirlT);
          ctx.beginPath();
          ctx.arc(0, 0, r + 6, 0, Math.PI * 1.3);
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 1.8 / k;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, r + 6, Math.PI, Math.PI * 2.3);
          ctx.strokeStyle = '#818cf8';
          ctx.lineWidth = 1.8 / k;
          ctx.stroke();
          ctx.restore();
        }

        // Feature 20: Dynamic Mastery Rings
        ctx.save();
        if (score === 0) {
          ctx.beginPath();
          ctx.arc(nx, ny, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(168, 168, 179, 0.35)';
          ctx.lineWidth = 1.2 / k;
          ctx.setLineDash([3 / k, 3 / k]);
          ctx.stroke();
        } else {
          // Track
          ctx.beginPath();
          ctx.arc(nx, ny, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1.2 / k;
          ctx.stroke();

          // Arc
          let ringColor = '#f59e0b'; // amber (< 50)
          let ringGlow = 'rgba(245, 158, 11, 0.5)';
          if (score >= 80) {
            ringColor = '#10b981'; // emerald (>= 80)
            ringGlow = 'rgba(16, 185, 129, 0.7)';
          } else if (score >= 50) {
            ringColor = '#38bdf8'; // cyan/blue (>= 50)
            ringGlow = 'rgba(56, 189, 248, 0.6)';
          }

          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + (score / 100) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(nx, ny, r + 3, startAngle, endAngle);
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = 1.8 / k;
          if (score >= 80) {
            ctx.shadowColor = ringGlow;
            ctx.shadowBlur = 6;
          }
          ctx.stroke();
        }
        ctx.restore();

        // Glow halo for selected / hovered
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(nx, ny, r + (isSelected ? 8 : 5), 0, Math.PI * 2);
          ctx.fillStyle = style.glow;
          ctx.fill();
        }

        // Main Node Particle
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = matchesSearch ? style.fill : '#40404a';
        ctx.fill();

        if (isSelected) {
          ctx.lineWidth = 2 / k;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        } else {
          ctx.lineWidth = 1 / k;
          ctx.strokeStyle = '#121214';
          ctx.stroke();
        }

        // Feature 4: Target Node Pulse Camera (Expanding animated pulse ring in obsidian cyan/gold)
        if (isSelected) {
          const nowTime = performance.now();
          const pulsePhase = (nowTime % 1800) / 1800; // 0 to 1
          const pulseRadius = r + 4 + pulsePhase * 24;
          const pulseAlpha = Math.max(0, 1 - pulsePhase);

          ctx.save();
          ctx.beginPath();
          ctx.arc(nx, ny, pulseRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(56, 189, 248, ${pulseAlpha * 0.85})`;
          ctx.lineWidth = 2.2 / k;
          ctx.shadowColor = 'rgba(56, 189, 248, 0.7)';
          ctx.shadowBlur = 8;
          ctx.stroke();

          const innerPhase = ((nowTime + 900) % 1800) / 1800;
          const innerRadius = r + 4 + innerPhase * 24;
          const innerAlpha = Math.max(0, 1 - innerPhase);
          ctx.beginPath();
          ctx.arc(nx, ny, innerRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(245, 158, 11, ${innerAlpha * 0.6})`;
          ctx.lineWidth = 1.4 / k;
          ctx.shadowColor = 'rgba(245, 158, 11, 0.6)';
          ctx.stroke();
          ctx.restore();
        }

        // Draw Small '+' button icon badge when hovered or selected
        if (isHovered || isSelected) {
          const plusOffset = r + 4;
          const plusX = nx + plusOffset;
          const plusY = ny - plusOffset;
          const plusR = 6 / k;

          ctx.beginPath();
          ctx.arc(plusX, plusY, plusR, 0, Math.PI * 2);
          ctx.fillStyle = '#8b7bf5';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1 / k;
          ctx.stroke();

          // Draw cross '+'
          ctx.beginPath();
          ctx.moveTo(plusX - 3 / k, plusY);
          ctx.lineTo(plusX + 3 / k, plusY);
          ctx.moveTo(plusX, plusY - 3 / k);
          ctx.lineTo(plusX, plusY + 3 / k);
          ctx.strokeStyle = '#121214';
          ctx.lineWidth = 1.2 / k;
          ctx.stroke();
        }

        // Portal badge icon if node is portal
        if (node.portal_topic_id) {
          const badgeX = nx - r - 4;
          const badgeY = ny - r - 2;
          ctx.save();
          ctx.font = `${Math.max(8, 9 / k)}px Geist Mono, monospace`;
          ctx.fillStyle = '#c084fc';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⟡', badgeX, badgeY);
          ctx.restore();
        }

        // Done indicator badge (green circle with checkmark)
        if (node.is_done) {
          const doneX = nx + (node.portal_topic_id ? r + 6 : -r - 4);
          const doneY = ny + r + 2;
          const doneR = Math.max(5.5, 6.5 / k);

          ctx.save();
          ctx.beginPath();
          ctx.arc(doneX, doneY, doneR, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.shadowColor = 'rgba(16, 185, 129, 0.6)';
          ctx.shadowBlur = 6;
          ctx.fill();

          ctx.strokeStyle = '#064e3b';
          ctx.lineWidth = 1 / k;
          ctx.stroke();

          ctx.font = `bold ${Math.max(7, 8 / k)}px sans-serif`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('✓', doneX, doneY + 0.5 / k);
          ctx.restore();
        }

        // Node Label & Mastery Star/%
        if (k > 0.45 || isHovered || isSelected) {
          ctx.font = `${Math.max(10, Math.min(13, 11 / k))}px Geist, -apple-system, sans-serif`;
          ctx.fillStyle = matchesSearch ? (isSelected ? '#ffffff' : style.text) : '#6b6b75';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          let labelText = node.title;
          if (!isHovered && !isSelected && labelText.length > 22) {
            labelText = labelText.slice(0, 20) + '...';
          }
          ctx.fillText(labelText, nx, ny + r + 4);

          // Feature 20: Display small mastery % or star if hovered or zoomed in (k >= 0.75)
          if ((k >= 0.75 || isHovered) && node.mastery_score !== undefined) {
            ctx.font = `${Math.max(8, 9 / k)}px Geist Mono, monospace`;
            ctx.fillStyle = score >= 80 ? '#10b981' : score >= 50 ? '#38bdf8' : score > 0 ? '#f59e0b' : '#9ca3af';
            const badgeText = score >= 80 ? `★ ${score}%` : `${score}%`;
            ctx.fillText(badgeText, nx, ny + r + 18 / k);
          }
        }

        ctx.restore();
      });

      ctx.restore();

      // Feature 22: Interactive Canvas Mini-Map (160x110px)
      if (miniMapRef.current && showMiniMap) {
        const mCanvas = miniMapRef.current;
        const mCtx = mCanvas.getContext('2d');
        if (mCtx) {
          mCtx.clearRect(0, 0, 160, 110);
          mCtx.fillStyle = '#18181b';
          mCtx.fillRect(0, 0, 160, 110);

          if (simNodes.length > 0) {
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
            const vLeft = -panX / k;
            const vTop = -panY / k;
            const vW = width / k;
            const vH = height / k;

            const pTL = toMini(vLeft, vTop);
            const pBR = toMini(vLeft + vW, vTop + vH);
            const wBox = pBR.x - pTL.x;
            const hBox = pBR.y - pTL.y;

            mCtx.fillStyle = 'rgba(56, 189, 248, 0.12)';
            mCtx.fillRect(pTL.x, pTL.y, wBox, hBox);
            mCtx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
            mCtx.lineWidth = 1.2;
            mCtx.strokeRect(pTL.x, pTL.y, wBox, hBox);
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    edges,
    selectedNodeId,
    searchFilter,
    activeFilters,
    layoutMode,
    lensMode,
    shortestPath,
    colorMode,
    showMiniMap,
  ]);

  useEffect(() => {
    (window as any).__graphHelper = {
      selectNodeById: (id: string) => {
        const target = simNodesRef.current.find((n) => n.id === id);
        if (target) onSelectNode(target);
      },
      selectFirstNode: () => {
        if (simNodesRef.current.length > 0) {
          onSelectNode(simNodesRef.current[0]);
        }
      },
      getNodeScreenCoords: (id: string) => {
        const target = simNodesRef.current.find((n) => n.id === id);
        if (target) {
          const rect = canvasRef.current?.getBoundingClientRect();
          const screen = worldToScreen(target.x || 0, target.y || 0);
          return {
            x: (rect?.left || 0) + screen.x,
            y: (rect?.top || 0) + screen.y,
          };
        }
        return null;
      },
      getNodes: () => simNodesRef.current.map((n) => ({ id: n.id, title: n.title, type: n.node_type })),
      getSimNodes: () => simNodesRef.current,
      fitGraph: () => fitGraph(),
    };
    return () => {
      delete (window as any).__graphHelper;
    };
  }, [onSelectNode]);

  // Coordinate helper
  const screenToWorld = (screenX: number, screenY: number) => {
    const { x, y, k } = transformRef.current;
    return {
      x: (screenX - x) / k,
      y: (screenY - y) / k,
    };
  };

  const worldToScreen = (worldX: number, worldY: number) => {
    const { x, y, k } = transformRef.current;
    return {
      x: worldX * k + x,
      y: worldY * k + y,
    };
  };

  // Find node under mouse
  const getNodeAtScreenPos = (screenX: number, screenY: number) => {
    const worldPos = screenToWorld(screenX, screenY);
    const { k } = transformRef.current;
    const simNodes = simNodesRef.current;
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

  // Find edge under mouse for click selection
  const getEdgeAtWorldPos = (worldX: number, worldY: number) => {
    const { k } = transformRef.current;
    const threshold = 10 / k;
    const nodeMap = new Map<string, GraphNode>();
    simNodesRef.current.forEach((n) => nodeMap.set(n.id, n));

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

  // Mini-map interaction
  const handleMiniMapClickOrDrag = (clientX: number, clientY: number) => {
    const miniCanvas = miniMapRef.current;
    const mainCanvas = canvasRef.current;
    if (!miniCanvas || !mainCanvas) return;
    const rect = miniCanvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    const simNodes = simNodesRef.current;
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

    const targetWorldX = minX - padding + (mx - offX) / scale;
    const targetWorldY = minY - padding + (my - offY) / scale;

    const k = transformRef.current.k;
    const newPanX = mainCanvas.clientWidth / 2 - targetWorldX * k;
    const newPanY = mainCanvas.clientHeight / 2 - targetWorldY * k;

    cameraTargetRef.current = null;
    transformRef.current = { ...transformRef.current, x: newPanX, y: newPanY };
    setTransform({ ...transformRef.current });
  };

  const handleMiniMapMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    isMiniMapDraggingRef.current = true;
    handleMiniMapClickOrDrag(e.clientX, e.clientY);
  };

  const handleMiniMapMouseMove = (e: React.MouseEvent) => {
    if (isMiniMapDraggingRef.current) {
      e.stopPropagation();
      handleMiniMapClickOrDrag(e.clientX, e.clientY);
    }
  };

  const handleMiniMapMouseUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    isMiniMapDraggingRef.current = false;
  };

  // Mouse / Pointer Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const hitNode = getNodeAtScreenPos(screenX, screenY);
    if (hitNode) {
      cameraTargetRef.current = null;
      const worldPos = screenToWorld(screenX, screenY);
      const { k } = transformRef.current;
      const r = hitNode.radius || 8;
      const plusOffset = r + 4;
      const plusX = (hitNode.x || 0) + plusOffset;
      const plusY = (hitNode.y || 0) - plusOffset;
      const distToPlus = Math.hypot(worldPos.x - plusX, worldPos.y - plusY);

      if (distToPlus <= 14 / k) {
        const screenCoords = worldToScreen(hitNode.x || 0, hitNode.y || 0);
        setPlusPopover({
          node: hitNode,
          x: screenCoords.x,
          y: screenCoords.y,
        });
        onSelectNode(hitNode);
        return;
      }

      draggingNodeRef.current = hitNode;
      onSelectNode(hitNode);
    } else {
      if (onSelectEdge) {
        const worldPos = screenToWorld(screenX, screenY);
        const hitEdge = getEdgeAtWorldPos(worldPos.x, worldPos.y);
        if (hitEdge) {
          onSelectEdge(hitEdge);
          return;
        }
      }
      isPanningRef.current = true;
      cameraTargetRef.current = null;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      setPlusPopover(null);
    }
    setContextMenu(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (draggingNodeRef.current) {
      const worldPos = screenToWorld(screenX, screenY);
      const node = draggingNodeRef.current;
      node.x = worldPos.x;
      node.y = worldPos.y;
      node.pos_x = worldPos.x;
      node.pos_y = worldPos.y;
      node.vx = 0;
      node.vy = 0;
      return;
    }

    if (isPanningRef.current) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      transformRef.current = {
        ...transformRef.current,
        x: transformRef.current.x + dx,
        y: transformRef.current.y + dy,
      };
      setTransform({ ...transformRef.current });
      return;
    }

    const hitNode = getNodeAtScreenPos(screenX, screenY);
    hoveredNodeRef.current = hitNode;
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingNodeRef.current) {
      const node = draggingNodeRef.current;
      node.pos_x = node.x;
      node.pos_y = node.y;
      node.vx = 0;
      node.vy = 0;
      if (onNodePositionChange && node.x !== undefined && node.y !== undefined) {
        onNodePositionChange(node.id, Math.round(node.x), Math.round(node.y));
      }
      draggingNodeRef.current = null;
    }
    isPanningRef.current = false;
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const hitNode = getNodeAtScreenPos(screenX, screenY);
    if (hitNode) {
      setContextMenu({
        node: hitNode,
        x: e.clientX,
        y: e.clientY,
      });
      setPlusPopover(null);
      onSelectNode(hitNode);
    } else {
      setContextMenu(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const current = transformRef.current;
    const newK = Math.max(0.2, Math.min(3.0, current.k * zoomFactor));

    const newX = mouseX - (mouseX - current.x) * (newK / current.k);
    const newY = mouseY - (mouseY - current.y) * (newK / current.k);

    cameraTargetRef.current = null;
    transformRef.current = { x: newX, y: newY, k: newK };
    setTransform({ x: newX, y: newY, k: newK });
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const hitNode = getNodeAtScreenPos(screenX, screenY);

    if (hitNode) {
      // Toggle '+' popover
      const screenCoords = worldToScreen(hitNode.x || 0, hitNode.y || 0);
      setPlusPopover({
        node: hitNode,
        x: screenCoords.x,
        y: screenCoords.y,
      });
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: isPanningRef.current ? 'grabbing' : 'grab',
        }}
      />

      {/* Interactive Mini-Map (Feature 22) */}
      {showMiniMap && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            width: '160px',
            height: '110px',
            backgroundColor: 'rgba(24, 24, 27, 0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
            cursor: 'crosshair',
            zIndex: 20,
          }}
          onMouseDown={handleMiniMapMouseDown}
          onMouseMove={handleMiniMapMouseMove}
          onMouseUp={handleMiniMapMouseUp}
          title="Canvas Mini-Map (Click or drag to navigate)"
        >
          <canvas
            ref={miniMapRef}
            width={160}
            height={110}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      )}

      {/* Floating '+' Action Popover */}
      {plusPopover && (
        <NodePlusPopover
          node={plusPopover.node}
          position={{ x: plusPopover.x, y: plusPopover.y }}
          difficulty={difficulty}
          onSelectAction={(action, targetNode) => {
            setPlusPopover(null);
            onOpenAction(action, targetNode);
          }}
          onClose={() => setPlusPopover(null)}
        />
      )}

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <NodeContextMenu
          node={contextMenu.node}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onInspect={(n) => {
            onSelectNode(n);
            setContextMenu(null);
          }}
          onSynthesizeNote={onSynthesizeNote ? (n) => onSynthesizeNote(n) : undefined}
          onDecomposeQuestion={onDecomposeQuestion ? (id) => onDecomposeQuestion(id) : undefined}
          onOpenQuiz={onOpenQuiz ? (n) => onOpenQuiz(n) : undefined}
          onToggleDone={onToggleDone ? (n) => onToggleDone(n) : undefined}
          onDeleteNode={
            onDeleteNode
              ? (id) => {
                  onDeleteNode(id);
                  setContextMenu(null);
                }
              : () => {}
          }
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Helper hint */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          backgroundColor: 'rgba(22, 22, 24, 0.8)',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          pointerEvents: 'none',
        }}
      >
        Click to inspect &bull; Right-click for options &bull; Drag to move freely &bull; Scroll to zoom
      </div>
    </div>
  );
});

KnowledgeGraphCanvas.displayName = 'KnowledgeGraphCanvas';
