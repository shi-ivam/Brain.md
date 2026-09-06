import { GraphNode, GraphEdge, NodeType, ShortestPathResult } from '../../../types';
import { TransformState, COLOR_MAP, getHeatmapColor } from './canvasTypes';

export interface RenderGraphCanvasOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  transform: TransformState;
  simNodes: GraphNode[];
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
  selectedNodeId?: string;
  hoveredNode: GraphNode | null;
  activeFilters: Set<NodeType>;
  searchFilter: string;
  lensMode: 'all' | '1-hop' | '2-hop';
  shortestPath: ShortestPathResult | null;
  colorMode: 'default' | 'heatmap';
  selectedCommunityNodeIds: Set<string> | null;
  resourcesCountMap: Map<string, number>;
}

export const renderGraphCanvas = ({
  ctx,
  width,
  height,
  dpr,
  transform,
  simNodes,
  edges,
  nodeMap,
  selectedNodeId,
  hoveredNode,
  activeFilters,
  searchFilter,
  lensMode,
  shortestPath,
  colorMode,
  selectedCommunityNodeIds,
  resourcesCountMap,
}: RenderGraphCanvasOptions): void => {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  // Apply pan & zoom
  const { x: panX, y: panY, k } = transform;
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

    // Canvas Edge Labels (zoom >= 0.75)
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
      ctx.font = `${Math.max(11, 12 / k)}px Geist Mono, monospace`;
      const textMetrics = ctx.measureText(labelText);
      const padH = 5 / k;
      const padV = 2.5 / k;
      const boxW = textMetrics.width + padH * 2;
      const boxH = 15 / k;

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

  // Shortest Path Trail (animated golden dashed trail with pulsing arrows)
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

    // Node completed indicator glow/ring
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

    // Shortest path golden glow
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

    // Portal Node Indicator (swirling orbital rings)
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

    // Dynamic Mastery Rings
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

    // Target Node Pulse Camera (Expanding animated pulse ring in obsidian cyan/gold)
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
      ctx.font = `${Math.max(10, 11 / k)}px Geist Mono, monospace`;
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
      const doneR = Math.max(6.5, 7.5 / k);

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

      ctx.font = `bold ${Math.max(8.5, 9.5 / k)}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓', doneX, doneY + 0.5 / k);
      ctx.restore();
    }

    // Attached resources indicator badge
    const nodeResCount = resourcesCountMap.get(node.id) || 0;
    if (nodeResCount > 0) {
      const resX = nx + (node.portal_topic_id ? r + 6 : -r - 4);
      const resY = ny - r - 2;
      const resR = Math.max(6.5, 7.5 / k);
      ctx.save();
      ctx.beginPath();
      ctx.arc(resX, resY, resR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1 / k;
      ctx.fill();
      ctx.stroke();

      ctx.font = `bold ${Math.max(8.5, 9.5 / k)}px sans-serif`;
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nodeResCount > 1 ? String(nodeResCount) : '•', resX, resY + 0.5 / k);
      ctx.restore();
    }

    // Node Label & Mastery Star/%
    if (k > 0.45 || isHovered || isSelected) {
      ctx.font = `${Math.max(12, Math.min(16, 13.5 / k))}px Geist, -apple-system, sans-serif`;
      ctx.fillStyle = matchesSearch ? (isSelected ? '#ffffff' : style.text) : '#6b6b75';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      let labelText = node.title;
      if (!isHovered && !isSelected && labelText.length > 22) {
        labelText = labelText.slice(0, 20) + '...';
      }
      ctx.fillText(labelText, nx, ny + r + 4);

      // Display small mastery % or star if hovered or zoomed in (k >= 0.75)
      if ((k >= 0.75 || isHovered) && node.mastery_score !== undefined) {
        ctx.font = `${Math.max(9.5, 10.5 / k)}px Geist Mono, monospace`;
        ctx.fillStyle = score >= 80 ? '#10b981' : score >= 50 ? '#38bdf8' : score > 0 ? '#f59e0b' : '#9ca3af';
        const badgeText = score >= 80 ? `★ ${score}%` : `${score}%`;
        ctx.fillText(badgeText, nx, ny + r + 20 / k);
      }
    }

    ctx.restore();
  });

  ctx.restore();
};
