import React, { useRef, useState } from 'react';
import { Topic } from '../types';
import { exportTopicJson, importTopicJson } from '../services/api';

interface VaultDrawerProps {
  isOpen: boolean;
  topics: Topic[];
  activeTopicId?: string;
  onSelectTopic: (topicId: string) => void;
  onDeleteTopic: (topicId: string) => void;
  onExportTopic: (topicId: string) => void;
  onClose: () => void;
  onNewTopic: () => void;
  onTopicImported?: (topicId: string) => void;
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
  onTopicImported,
}) => {
  const [isExportingJson, setIsExportingJson] = useState<string | null>(null);
  const [isImportingJson, setIsImportingJson] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJson = async (topic: Topic) => {
    setIsExportingJson(topic.id);
    try {
      const blob = await exportTopicJson(topic.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${topic.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-backup.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export JSON:', err);
      alert('Failed to export JSON backup');
    } finally {
      setIsExportingJson(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingJson(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await importTopicJson(parsed);
      if (onTopicImported) {
        onTopicImported(result.topic_id);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to import JSON backup:', err);
      alert(`Import failed: ${err?.message || 'Invalid JSON file'}`);
    } finally {
      setIsImportingJson(false);
      if (e.target) e.target.value = '';
    }
  };

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

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,application/json"
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImportingJson}
              className="obsidian-btn obsidian-btn-subtle"
              style={{ fontSize: '12px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
              title="Import Topic JSON Backup"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {isImportingJson ? 'Importing...' : 'Import Backup'}
            </button>
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
                      onClick={() => handleExportJson(t)}
                      disabled={isExportingJson === t.id}
                      className="obsidian-btn-subtle"
                      title="Export Topic JSON Backup"
                      style={{ padding: '6px' }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="12" y2="18" />
                        <line x1="15" y1="15" x2="12" y2="18" />
                      </svg>
                    </button>
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
