import React from 'react';
import { GraphNode, GraphEdge } from '../../types';

interface ConnectionsTabProps {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelectNode: (node: GraphNode) => void;
}

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  node,
  nodes,
  edges,
  onSelectNode,
}) => {
  const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]));

  // Ingoing: target == current node
  const incoming = edges
    .filter((e) => e.target_id === node.id)
    .map((e) => ({
      edge: e,
      otherNode: nodeMap.get(e.source_id),
    }))
    .filter((item): item is { edge: GraphEdge; otherNode: GraphNode } => !!item.otherNode);

  // Outgoing: source == current node
  const outgoing = edges
    .filter((e) => e.source_id === node.id)
    .map((e) => ({
      edge: e,
      otherNode: nodeMap.get(e.target_id),
    }))
    .filter((item): item is { edge: GraphEdge; otherNode: GraphNode } => !!item.otherNode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', overflowY: 'auto' }}>
      {/* Incoming */}
      <div>
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Prerequisites & Influences ({incoming.length})
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
          {incoming.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>None (Root entry point)</span>
          ) : (
            incoming.map(({ edge, otherNode }) => (
              <div
                key={edge.id}
                onClick={() => onSelectNode(otherNode)}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    [[{otherNode.title}]]
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {edge.label || edge.relation_type}
                  </div>
                </div>
                <span className={`obsidian-badge badge-${otherNode.node_type}`} style={{ fontSize: '10px' }}>
                  {otherNode.node_type}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Outgoing */}
      <div>
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Leads Into & Branches ({outgoing.length})
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
          {outgoing.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No outward branches yet. Click '+' to expand.</span>
          ) : (
            outgoing.map(({ edge, otherNode }) => (
              <div
                key={edge.id}
                onClick={() => onSelectNode(otherNode)}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    [[{otherNode.title}]]
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {edge.label || edge.relation_type}
                  </div>
                </div>
                <span className={`obsidian-badge badge-${otherNode.node_type}`} style={{ fontSize: '10px' }}>
                  {otherNode.node_type}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
