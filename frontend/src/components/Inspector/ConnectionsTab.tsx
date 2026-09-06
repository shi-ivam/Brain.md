import React, { useState, useEffect, useCallback } from 'react';
import { GraphNode, GraphEdge, UnlinkedMention, KnowledgeGraphData } from '../../types';
import { fetchUnlinkedMentions, saveNodeNote, syncWikilinks } from '../../services/api';

interface ConnectionsTabProps {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelectNode: (node: GraphNode) => void;
  onGraphUpdated?: (fullGraph: KnowledgeGraphData) => void;
}

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  node,
  nodes,
  edges,
  onSelectNode,
  onGraphUpdated,
}) => {
  const [unlinkedMentions, setUnlinkedMentions] = useState<UnlinkedMention[]>([]);
  const [loadingMentions, setLoadingMentions] = useState(false);
  const [linkifyingNodeId, setLinkifyingNodeId] = useState<string | null>(null);

  const loadMentions = useCallback(async () => {
    setLoadingMentions(true);
    try {
      const res = await fetchUnlinkedMentions(node.id);
      setUnlinkedMentions(res);
    } catch (err) {
      console.error('Failed to load unlinked mentions:', err);
    } finally {
      setLoadingMentions(false);
    }
  }, [node.id]);

  useEffect(() => {
    loadMentions();
  }, [loadMentions]);

  const handleLinkify = async (mention: UnlinkedMention) => {
    setLinkifyingNodeId(mention.node_id);
    try {
      const sourceNode = nodes.find((n) => n.id === mention.node_id);
      const existingContent = sourceNode?.content || '';
      const wikilinkTag = `[[${node.title}]]`;

      // Append [[Target Node Title]] to the source node's content
      const updatedContent = existingContent.trim()
        ? `${existingContent}\n\n${wikilinkTag}`
        : wikilinkTag;

      await saveNodeNote(mention.node_id, updatedContent, sourceNode?.title);
      const syncRes = await syncWikilinks(node.topic_id);
      if (onGraphUpdated && syncRes.full_graph) {
        onGraphUpdated(syncRes.full_graph);
      }
      await loadMentions();
    } catch (err) {
      console.error('Failed to linkify mention:', err);
    } finally {
      setLinkifyingNodeId(null);
    }
  };

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

      {/* Unlinked Mentions (Feature 5) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Unlinked Mentions ({unlinkedMentions.length})
          </span>
          {loadingMentions && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Scanning notes...</span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
          {unlinkedMentions.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              No unlinked mentions found in other concept notes.
            </span>
          ) : (
            unlinkedMentions.map((mention) => (
              <div
                key={mention.node_id}
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    onClick={() => {
                      const other = nodes.find((n) => n.id === mention.node_id);
                      if (other) onSelectNode(other);
                    }}
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    [[{mention.title}]]
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      marginTop: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    "{mention.snippet}"
                  </div>
                </div>

                <button
                  onClick={() => handleLinkify(mention)}
                  disabled={linkifyingNodeId === mention.node_id}
                  className="obsidian-btn"
                  style={{
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderColor: 'var(--accent-purple)',
                    color: 'var(--text-primary)',
                    backgroundColor: 'rgba(139, 123, 245, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexShrink: 0,
                  }}
                  title={`Append [[${node.title}]] to this note and sync graph`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  {linkifyingNodeId === mention.node_id ? 'Linking...' : 'Linkify'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

