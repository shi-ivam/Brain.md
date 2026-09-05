import React from 'react';
import { Topic } from '../types';

interface VaultDrawerProps {
  isOpen: boolean;
  topics: Topic[];
  activeTopicId?: string;
  onSelectTopic: (topicId: string) => void;
  onDeleteTopic: (topicId: string) => void;
  onExportTopic: (topicId: string) => void;
  onClose: () => void;
  onNewTopic: () => void;
}

export const VaultDrawer: React.FC<VaultDrawerProps> = ({
  isOpen,
  topics,
  activeTopicId,
  onSelectTopic,
  onDeleteTopic,
  onExportTopic,
  onClose,
  onNewTopic,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ fontSize: '16px', margin: '0 0 2px 0', fontWeight: 600 }}>
              Knowledge Vaults
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Persistent SQLite storage ({topics.length} topics saved)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onNewTopic} className="obsidian-btn obsidian-btn-primary" style={{ fontSize: '12px', padding: '4px 10px' }}>
              + New Topic
            </button>
            <button onClick={onClose} className="obsidian-btn-subtle" style={{ padding: '4px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Topics List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {topics.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No topics created yet. Type any subject in the spotlight search to begin.
            </div>
          ) : (
            topics.map((t) => {
              const isActive = t.id === activeTopicId;
              return (
                <div
                  key={t.id}
                  style={{
                    backgroundColor: isActive ? 'rgba(139, 123, 245, 0.1)' : 'var(--bg-card)',
                    border: `1px solid ${isActive ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                    borderRadius: '6px',
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'border-color 150ms ease',
                  }}
                >
                  <div
                    onClick={() => {
                      onSelectTopic(t.id);
                      onClose();
                    }}
                    style={{ flex: 1, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {t.title}
                      </span>
                      <span className={`obsidian-badge badge-concept`} style={{ fontSize: '10px' }}>
                        {t.difficulty?.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(t.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => onExportTopic(t.id)}
                      className="obsidian-btn-subtle"
                      title="Export to Obsidian Vault (.zip)"
                      style={{ padding: '6px' }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete graph "${t.title}"?`)) {
                          onDeleteTopic(t.id);
                        }
                      }}
                      className="obsidian-btn-subtle"
                      title="Delete graph"
                      style={{ padding: '6px', color: '#f87171' }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
