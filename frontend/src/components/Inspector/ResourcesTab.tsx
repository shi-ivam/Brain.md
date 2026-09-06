import React, { useState } from 'react';
import { GraphNode, DifficultyLevel, NodeResource, ResourceType } from '../../types';
import { deleteResource } from '../../services/api';
import {
  ResourceCard,
  AddResourceModal,
  PdfViewerModal,
  createResourceSnippet,
} from './resources';

interface ResourcesTabProps {
  node: GraphNode;
  resources: NodeResource[];
  difficulty: DifficultyLevel;
  onResourceAdded: (resource: NodeResource) => void;
  onResourceDeleted: (resourceId: string) => void;
  onInsertIntoNote?: (markdownSnippet: string) => void;
}

export const ResourcesTab: React.FC<ResourcesTabProps> = ({
  node,
  resources,
  difficulty,
  onResourceAdded,
  onResourceDeleted,
  onInsertIntoNote,
}) => {
  const [filterType, setFilterType] = useState<'all' | ResourceType>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalTab, setAddModalTab] = useState<'youtube' | 'pdf' | 'url' | 'ai'>('youtube');
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [activePdf, setActivePdf] = useState<{ title: string; url: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const filteredResources = resources.filter((r) => {
    if (filterType === 'all') return true;
    return r.resource_type === filterType;
  });

  const videoCount = resources.filter((r) => r.resource_type === 'youtube').length;
  const pdfCount = resources.filter((r) => r.resource_type === 'pdf').length;
  const urlCount = resources.filter((r) => r.resource_type === 'url' || r.resource_type === 'other').length;

  const handleOpenAddModal = (tab: 'youtube' | 'pdf' | 'url' | 'ai' = 'youtube') => {
    setAddModalTab(tab);
    setIsAddModalOpen(true);
  };

  const handleDelete = async (resId: string, title: string) => {
    if (!window.confirm(`Remove attached resource "${title}"?`)) return;
    try {
      await deleteResource(resId);
      onResourceDeleted(resId);
      showToast('Resource removed');
    } catch (err: any) {
      console.error('Failed to delete resource:', err);
      alert('Failed to remove resource: ' + (err.message || ''));
    }
  };

  const handleInsertSnippet = (res: NodeResource) => {
    if (!onInsertIntoNote) return;
    const snippet = createResourceSnippet(res);
    onInsertIntoNote(snippet);
    showToast('Inserted into Study Note');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '20px',
            backgroundColor: 'var(--accent-purple)',
            color: '#fff',
            padding: '7px 16px',
            borderRadius: '4px',
            fontSize: '13.5px',
            fontWeight: 500,
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Top Controls & Filter Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilterType('all')}
            className={`obsidian-btn ${filterType === 'all' ? 'obsidian-btn-primary' : ''}`}
            style={{ fontSize: '12.5px', padding: '4px 11px' }}
          >
            All ({resources.length})
          </button>
          <button
            onClick={() => setFilterType('youtube')}
            className={`obsidian-btn ${filterType === 'youtube' ? 'obsidian-btn-primary' : ''}`}
            style={{ fontSize: '12.5px', padding: '4px 11px' }}
          >
            Videos ({videoCount})
          </button>
          <button
            onClick={() => setFilterType('pdf')}
            className={`obsidian-btn ${filterType === 'pdf' ? 'obsidian-btn-primary' : ''}`}
            style={{ fontSize: '12.5px', padding: '4px 11px' }}
          >
            PDFs ({pdfCount})
          </button>
          <button
            onClick={() => setFilterType('url')}
            className={`obsidian-btn ${filterType === 'url' ? 'obsidian-btn-primary' : ''}`}
            style={{ fontSize: '12.5px', padding: '4px 11px' }}
          >
            Links ({urlCount})
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => handleOpenAddModal('ai')}
            className="obsidian-btn"
            style={{
              fontSize: '12.5px',
              padding: '5px 12px',
              color: 'var(--accent-purple-light)',
              borderColor: 'rgba(191, 164, 248, 0.4)',
              background: 'rgba(191, 164, 248, 0.08)',
            }}
            title="Curate top video lectures, lecture notes, and papers with AI"
          >
            Find with AI
          </button>
          <button
            onClick={() => handleOpenAddModal('youtube')}
            className="obsidian-btn-primary"
            style={{ fontSize: '12.5px', padding: '5px 14px' }}
          >
            + Attach Resource
          </button>
        </div>
      </div>

      {/* Resource Cards List */}
      {filteredResources.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '8px',
            border: '1px dashed var(--border-subtle)',
            margin: '8px 0',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: 'var(--text-muted)' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <h4 style={{ margin: '0 0 6px 0', color: 'var(--text-primary)', fontSize: '17px' }}>
            No Attached Resources Yet
          </h4>
          <p style={{ fontSize: '13.5px', maxWidth: '380px', lineHeight: 1.5, margin: '0 0 16px 0' }}>
            Attach YouTube video lectures, university lecture PDFs, or seminal papers directly to{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{node.title}</strong> to reinforce concepts with multimedia intuition.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => handleOpenAddModal('youtube')}
              className="obsidian-btn"
              style={{ fontSize: '13px', padding: '7px 14px' }}
            >
              Add YouTube Video
            </button>
            <button
              onClick={() => handleOpenAddModal('pdf')}
              className="obsidian-btn"
              style={{ fontSize: '13px', padding: '7px 14px' }}
            >
              Upload Lecture PDF
            </button>
            <button
              onClick={() => handleOpenAddModal('ai')}
              className="obsidian-btn"
              style={{
                fontSize: '13px',
                padding: '7px 14px',
                color: 'var(--accent-purple-light)',
                borderColor: 'var(--accent-purple)',
              }}
            >
              Curate with AI
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '24px' }}>
          {filteredResources.map((res) => (
            <ResourceCard
              key={res.id}
              resource={res}
              isPlaying={playingVideoId === res.id}
              onTogglePlay={setPlayingVideoId}
              onOpenPdf={setActivePdf}
              onInsertSnippet={handleInsertSnippet}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal: Attach Resource */}
      <AddResourceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        node={node}
        difficulty={difficulty}
        initialTab={addModalTab}
        onResourceAdded={onResourceAdded}
        showToast={showToast}
      />

      {/* Modal: In-App Full PDF Viewer */}
      <PdfViewerModal
        pdf={activePdf}
        onClose={() => setActivePdf(null)}
      />
    </div>
  );
};
