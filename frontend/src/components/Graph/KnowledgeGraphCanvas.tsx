import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GraphNode, GraphEdge, LayoutMode, NodeType, DifficultyLevel } from '../../types';
import { NodePlusPopover } from './NodePlusPopover';
import { NodeContextMenu } from './NodeContextMenu';

interface KnowledgeGraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layoutMode: LayoutMode;
  selectedNodeId?: string;
  onSelectNode: (node: GraphNode) => void;
  onOpenAction: (
    action: 'add_question' | 'add_note' | 'generate_quiz' | 'expand_subtopics' | 'decompose_question' | 'subquestions' | 'tested_concepts',
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
}

const COLOR_MAP: Record<NodeType, { fill: string; glow: string; text: string }> = {
  concept: { fill: '#bfa4f8', glow: 'rgba(191, 164, 248, 0.4)', text: '#e5d9fd' },
  prerequisite: { fill: '#f87171', glow: 'rgba(248, 113, 113, 0.4)', text: '#fca5a5' },
  subtopic: { fill: '#a8a8b3', glow: 'rgba(168, 168, 179, 0.3)', text: '#d1d1d8' },
  question: { fill: '#7dd3fc', glow: 'rgba(125, 211, 252, 0.4)', text: '#bae6fd' },
  quiz: { fill: '#fde047', glow: 'rgba(253, 224, 71, 0.4)', text: '#fef08a' },
  note: { fill: '#6ee7b7', glow: 'rgba(110, 231, 183, 0.4)', text: '#a7f3d0' },
};

export const KnowledgeGraphCanvas: React.FC<KnowledgeGraphCanvasProps> = ({
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Transform: Pan & Zoom
  const transformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

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
      const defaultX = isManual ? node.pos_x! : targetX;
      const defaultY = isManual ? node.pos_y! : targetY;

      if (!layoutChanged && existing && existing.x !== undefined && existing.y !== undefined) {
        return {
          ...node,
          x: existing.x,
          y: existing.y,
          vx: existing.vx || 0,
          vy: existing.vy || 0,
          pos_x: existing.pos_x ?? defaultX,
          pos_y: existing.pos_y ?? defaultY,
          radius,
        };
      }

      return {
        ...node,
        x: defaultX,
        y: defaultY,
        pos_x: defaultX,
        pos_y: defaultY,
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
      const x = n.x || 0;
      const y = n.y || 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });

    const padding = 100;
    const graphWidth = Math.max(100, maxX - minX + padding * 2);
    const graphHeight = Math.max(100, maxY - minY + padding * 2);

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / graphWidth;
    const scaleY = rect.height / graphHeight;
    const k = Math.max(0.4, Math.min(1.4, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const newX = rect.width / 2 - centerX * k;
    const newY = rect.height / 2 - centerY * k;

    transformRef.current = { x: newX, y: newY, k };
    setTransform({ x: newX, y: newY, k });
  }, []);

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
      const numNodes = simNodes.length;
      const repulsion = layoutMode === 'dag' ? 350 : 600;
      const springLength = layoutMode === 'dag' ? 120 : 90;
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

          // Rightward tendency: Target node should naturally sit to the right of Source node with spread
          const minRightSeparation = 180;
          if (tgt.x !== undefined && src.x !== undefined && tgt.x < src.x + minRightSeparation) {
            const pushX = (src.x + minRightSeparation - tgt.x) * 0.04;
            tgt.vx = (tgt.vx || 0) + pushX;
            src.vx = (src.vx || 0) - pushX * 0.4;
          }
        }
      });

      // 3. Update velocity & position
      simNodes.forEach((node) => {
        if (draggingNodeRef.current?.id === node.id) {
          node.vx = 0;
          node.vy = 0;
          return;
        }

        // Rightward layout guidance: Nudge towards target rightward tier and vertical spread
        if (node.pos_x !== undefined) {
          const targetX = node.pos_x;
          node.vx = (node.vx || 0) + (targetX - (node.x || 0)) * (layoutMode === 'dag' ? 0.06 : 0.015);
        }
        if (layoutMode === 'dag' && node.pos_y !== undefined) {
          const targetY = node.pos_y;
          node.vy = (node.vy || 0) + (targetY - (node.y || 0)) * 0.05;
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

      // --- Drawing Step ---
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
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
      const startX = Math.floor((-panX / k) / gridSize) * gridSize;
      const endX = Math.ceil(((-panX + width) / k) / gridSize) * gridSize;
      const startY = Math.floor((-panY / k) / gridSize) * gridSize;
      const endY = Math.ceil(((-panY + height) / k) / gridSize) * gridSize;

      for (let gx = startX; gx <= endX; gx += gridSize) {
        for (let gy = startY; gy <= endY; gy += gridSize) {
          ctx.fillRect(gx - 0.5, gy - 0.5, 1, 1);
        }
      }

      const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;
      const hoveredNode = hoveredNodeRef.current;

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
      });

      // Draw Nodes
      simNodes.forEach((node) => {
        if (!activeFilters.has(node.node_type)) return;

        const nx = node.x || 0;
        const ny = node.y || 0;
        const r = node.radius || 8;
        const isSelected = node.id === selectedNodeId;
        const isHovered = hoveredNode?.id === node.id;
        const matchesSearch =
          !searchFilter ||
          node.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
          (node.summary && node.summary.toLowerCase().includes(searchFilter.toLowerCase()));

        const style = COLOR_MAP[node.node_type] || COLOR_MAP.concept;

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

        // Node Label
        if (k > 0.45 || isHovered || isSelected) {
          ctx.font = `${Math.max(10, Math.min(13, 11 / k))}px Geist, -apple-system, sans-serif`;
          ctx.fillStyle = matchesSearch ? (isSelected ? '#ffffff' : style.text) : '#6b6b75';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          // Truncate long labels unless hovered/selected
          let labelText = node.title;
          if (!isHovered && !isSelected && labelText.length > 22) {
            labelText = labelText.slice(0, 20) + '...';
          }
          ctx.fillText(labelText, nx, ny + r + 4);
        }
      });

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [edges, selectedNodeId, searchFilter, activeFilters, layoutMode]);

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

  // Mouse / Pointer Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const hitNode = getNodeAtScreenPos(screenX, screenY);
    if (hitNode) {
      const worldPos = screenToWorld(screenX, screenY);
      const { k } = transformRef.current;
      const r = hitNode.radius || 8;
      const plusOffset = r + 4;
      const plusX = (hitNode.x || 0) + plusOffset;
      const plusY = (hitNode.y || 0) - plusOffset;
      const distToPlus = Math.hypot(worldPos.x - plusX, worldPos.y - plusY);

      if (distToPlus <= 14 / k) {
        // Clicked the small '+' icon!
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
      isPanningRef.current = true;
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
          onDeleteNode={onDeleteNode ? (id) => {
            onDeleteNode(id);
            setContextMenu(null);
          } : () => {}}
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
};
