import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { GraphNode, GraphEdge, LayoutMode } from '../../types';
import { NodePlusPopover } from './NodePlusPopover';
import { NodeContextMenu } from './NodeContextMenu';
import { LinkContextMenu } from './LinkContextMenu';
import {
  KnowledgeGraphCanvasHandle,
  KnowledgeGraphCanvasProps,
  TransformState,
  initializeGraphNodes,
  stepPhysics,
  screenToWorld,
  worldToScreen,
  getNodeAtScreenPos,
  getEdgeAtWorldPos,
  renderGraphCanvas,
  renderMiniMap,
  calculateMiniMapPan,
} from './canvas';

export type { KnowledgeGraphCanvasHandle, KnowledgeGraphCanvasProps };

export const KnowledgeGraphCanvas = forwardRef<KnowledgeGraphCanvasHandle, KnowledgeGraphCanvasProps>(
  (
    {
      nodes,
      edges,
      resources = [],
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
      onOpenResources,
      onOpenVisualizations,
      onOpenSlides,
      onToggleDone,
      lensMode = 'all',
      shortestPath = null,
      colorMode = 'default',
      showMiniMap = true,
      onSelectEdge,
      selectedCommunityNodeIds = null,
      onBridgeEdge,
      onInsertNodeOnEdge,
      onDeleteEdge,
      onUpdateEdge,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const miniMapRef = useRef<HTMLCanvasElement | null>(null);

    // Transform: Pan & Zoom
    const transformRef = useRef<TransformState>({ x: 0, y: 0, k: 1 });
    const [, setTransform] = useState({ x: 0, y: 0, k: 1 });

    // Camera auto-focus target
    const cameraTargetRef = useRef<{ x: number; y: number } | null>(null);
    const prevSelectedNodeIdRef = useRef<string | undefined>(undefined);
    const isMiniMapDraggingRef = useRef(false);

    // Physics simulation state
    const simNodesRef = useRef<GraphNode[]>([]);
    const isPanningRef = useRef(false);
    const draggingNodeRef = useRef<GraphNode | null>(null);
    const lastMousePosRef = useRef({ x: 0, y: 0 });
    const hoveredNodeRef = useRef<GraphNode | null>(null);

    // Context menus and popovers
    const [plusPopover, setPlusPopover] = useState<{ node: GraphNode; x: number; y: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ node: GraphNode; x: number; y: number } | null>(null);
    const [linkContextMenu, setLinkContextMenu] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null);

    const lastLayoutModeRef = useRef<LayoutMode>(layoutMode);

    // Center camera on selected node when selectedNodeId changes
    useEffect(() => {
      if (selectedNodeId && selectedNodeId !== prevSelectedNodeIdRef.current) {
        const target = simNodesRef.current.find((n) => n.id === selectedNodeId);
        if (target && target.x !== undefined && target.y !== undefined) {
          cameraTargetRef.current = { x: target.x, y: target.y };
        }
      }
      prevSelectedNodeIdRef.current = selectedNodeId;
    }, [selectedNodeId]);

    // Initialize positions based on layoutMode
    useEffect(() => {
      const layoutChanged = lastLayoutModeRef.current !== layoutMode;
      lastLayoutModeRef.current = layoutMode;

      simNodesRef.current = initializeGraphNodes(
        nodes,
        edges,
        layoutMode,
        simNodesRef.current,
        layoutChanged
      );
    }, [nodes, edges, layoutMode]);

    // Center / Fit Graph
    const fitGraph = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || simNodesRef.current.length === 0) return;
      const simNodes = simNodesRef.current;

      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      simNodes.forEach((n) => {
        const x = n.pos_x !== undefined ? n.pos_x : (n.x || 0);
        const y = n.pos_y !== undefined ? n.pos_y : (n.y || 0);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const graphWidth = maxX - minX + 160;
      const graphHeight = maxY - minY + 160;

      const k = Math.min(Math.max(0.3, Math.min(width / graphWidth, height / graphHeight)), 1.5);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      cameraTargetRef.current = null;
      transformRef.current = {
        k,
        x: width / 2 - centerX * k,
        y: height / 2 - centerY * k,
      };
      setTransform({ ...transformRef.current });
    }, []);

    const zoomIn = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const current = transformRef.current;
      const newK = Math.min(3.0, current.k * 1.25);
      const newX = width / 2 - (width / 2 - current.x) * (newK / current.k);
      const newY = height / 2 - (height / 2 - current.y) * (newK / current.k);
      cameraTargetRef.current = null;
      transformRef.current = { x: newX, y: newY, k: newK };
      setTransform({ x: newX, y: newY, k: newK });
    }, []);

    const zoomOut = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const current = transformRef.current;
      const newK = Math.max(0.2, current.k / 1.25);
      const newX = width / 2 - (width / 2 - current.x) * (newK / current.k);
      const newY = height / 2 - (height / 2 - current.y) * (newK / current.k);
      cameraTargetRef.current = null;
      transformRef.current = { x: newX, y: newY, k: newK };
      setTransform({ x: newX, y: newY, k: newK });
    }, []);

    useImperativeHandle(ref, () => ({ fitGraph, zoomIn, zoomOut }), [fitGraph, zoomIn, zoomOut]);

    // Initial center on load
    useEffect(() => {
      if (nodes.length > 0) {
        setTimeout(fitGraph, 100);
      }
    }, [nodes.length === 0, fitGraph]);

    // Main animation & Canvas render loop
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

        // Physics step
        stepPhysics(simNodes, edges, nodeMap, layoutMode, draggingNodeRef.current?.id);

        // Camera auto-focus target interpolation
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

        // DPR sizing
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
        }

        // Resources count map
        const resourcesCountMap = new Map<string, number>();
        (resources || []).forEach((r) => {
          resourcesCountMap.set(r.node_id, (resourcesCountMap.get(r.node_id) || 0) + 1);
        });

        // Canvas Drawing
        renderGraphCanvas({
          ctx,
          width,
          height,
          dpr,
          transform: transformRef.current,
          simNodes,
          edges,
          nodeMap,
          selectedNodeId,
          hoveredNode: hoveredNodeRef.current,
          activeFilters,
          searchFilter,
          lensMode,
          shortestPath,
          colorMode,
          selectedCommunityNodeIds,
          resourcesCountMap,
        });

        // MiniMap Drawing
        if (miniMapRef.current && showMiniMap) {
          renderMiniMap({
            miniMapCanvas: miniMapRef.current,
            simNodes,
            edges,
            nodeMap,
            selectedNodeId,
            transform: transformRef.current,
            mainWidth: width,
            mainHeight: height,
          });
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
      selectedCommunityNodeIds,
      resources,
    ]);

    // Global testing/automation helper
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
            const screen = worldToScreen(target.x || 0, target.y || 0, transformRef.current);
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
    }, [onSelectNode, fitGraph]);

    // Mini-map interaction
    const handleMiniMapClickOrDrag = (clientX: number, clientY: number) => {
      const miniCanvas = miniMapRef.current;
      const mainCanvas = canvasRef.current;
      if (!miniCanvas || !mainCanvas) return;

      const newPan = calculateMiniMapPan(
        clientX,
        clientY,
        miniCanvas,
        mainCanvas,
        simNodesRef.current,
        transformRef.current.k
      );
      if (newPan) {
        cameraTargetRef.current = null;
        transformRef.current = { ...transformRef.current, ...newPan };
        setTransform({ ...transformRef.current });
      }
    };

    // Mouse / Pointer Handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      const hitNode = getNodeAtScreenPos(
        screenX,
        screenY,
        simNodesRef.current,
        transformRef.current,
        activeFilters
      );

      if (hitNode) {
        cameraTargetRef.current = null;
        const worldPos = screenToWorld(screenX, screenY, transformRef.current);
        const { k } = transformRef.current;
        const r = hitNode.radius || 8;
        const plusOffset = r + 4;
        const plusX = (hitNode.x || 0) + plusOffset;
        const plusY = (hitNode.y || 0) - plusOffset;
        const distToPlus = Math.hypot(worldPos.x - plusX, worldPos.y - plusY);

        if (distToPlus <= 14 / k) {
          const screenCoords = worldToScreen(hitNode.x || 0, hitNode.y || 0, transformRef.current);
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
          const worldPos = screenToWorld(screenX, screenY, transformRef.current);
          const nodeMap = new Map<string, GraphNode>();
          simNodesRef.current.forEach((n) => nodeMap.set(n.id, n));
          const hitEdge = getEdgeAtWorldPos(worldPos.x, worldPos.y, edges, nodeMap, transformRef.current);
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
      setLinkContextMenu(null);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      if (draggingNodeRef.current) {
        const worldPos = screenToWorld(screenX, screenY, transformRef.current);
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

      const hitNode = getNodeAtScreenPos(
        screenX,
        screenY,
        simNodesRef.current,
        transformRef.current,
        activeFilters
      );
      hoveredNodeRef.current = hitNode;
    };

    const handleMouseUp = () => {
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

      const hitNode = getNodeAtScreenPos(
        screenX,
        screenY,
        simNodesRef.current,
        transformRef.current,
        activeFilters
      );

      if (hitNode) {
        setContextMenu({ node: hitNode, x: e.clientX, y: e.clientY });
        setLinkContextMenu(null);
        setPlusPopover(null);
        onSelectNode(hitNode);
      } else {
        const worldPos = screenToWorld(screenX, screenY, transformRef.current);
        const nodeMap = new Map<string, GraphNode>();
        simNodesRef.current.forEach((n) => nodeMap.set(n.id, n));
        const hitEdge = getEdgeAtWorldPos(worldPos.x, worldPos.y, edges, nodeMap, transformRef.current);
        if (hitEdge) {
          setLinkContextMenu({ edge: hitEdge, x: e.clientX, y: e.clientY });
          setContextMenu(null);
          setPlusPopover(null);
          if (onSelectEdge) onSelectEdge(hitEdge);
        } else {
          setContextMenu(null);
          setLinkContextMenu(null);
        }
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
      const hitNode = getNodeAtScreenPos(
        screenX,
        screenY,
        simNodesRef.current,
        transformRef.current,
        activeFilters
      );

      if (hitNode) {
        const screenCoords = worldToScreen(hitNode.x || 0, hitNode.y || 0, transformRef.current);
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

        {/* Interactive Mini-Map */}
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
            onMouseDown={(e) => {
              e.stopPropagation();
              isMiniMapDraggingRef.current = true;
              handleMiniMapClickOrDrag(e.clientX, e.clientY);
            }}
            onMouseMove={(e) => {
              if (isMiniMapDraggingRef.current) {
                e.stopPropagation();
                handleMiniMapClickOrDrag(e.clientX, e.clientY);
              }
            }}
            onMouseUp={(e) => {
              e.stopPropagation();
              isMiniMapDraggingRef.current = false;
            }}
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
            onOpenResources={onOpenResources ? (n) => onOpenResources(n) : undefined}
            onOpenVisualizations={onOpenVisualizations ? (n) => onOpenVisualizations(n) : undefined}
            onOpenSlides={onOpenSlides ? (n) => onOpenSlides(n) : undefined}
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

        {/* Right-Click Link Context Menu */}
        {linkContextMenu && (
          <LinkContextMenu
            edge={linkContextMenu.edge}
            sourceNode={nodes.find((n) => n.id === linkContextMenu.edge.source_id)}
            targetNode={nodes.find((n) => n.id === linkContextMenu.edge.target_id)}
            position={{ x: linkContextMenu.x, y: linkContextMenu.y }}
            onBridgeEdge={async (edgeId, count, diff, note) => {
              if (onBridgeEdge) await onBridgeEdge(edgeId, count, diff, note);
              setLinkContextMenu(null);
            }}
            onInsertNode={async (edgeId, title, nType, summary, r1, r2, l1, l2) => {
              if (onInsertNodeOnEdge) await onInsertNodeOnEdge(edgeId, title, nType, summary, r1, r2, l1, l2);
              setLinkContextMenu(null);
            }}
            onUpdateEdge={
              onUpdateEdge
                ? async (edgeId, rType, lbl) => {
                    await onUpdateEdge(edgeId, rType, lbl);
                    setLinkContextMenu(null);
                  }
                : undefined
            }
            onDeleteEdge={async (edgeId) => {
              if (onDeleteEdge) await onDeleteEdge(edgeId);
              setLinkContextMenu(null);
            }}
            onClose={() => setLinkContextMenu(null)}
          />
        )}

        {/* Helper hint */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            backgroundColor: 'rgba(22, 22, 24, 0.8)',
            padding: '5px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            pointerEvents: 'none',
          }}
        >
          Click to inspect &bull; Right-click for options &bull; Drag to move freely &bull; Scroll to zoom
        </div>
      </div>
    );
  }
);

KnowledgeGraphCanvas.displayName = 'KnowledgeGraphCanvas';
