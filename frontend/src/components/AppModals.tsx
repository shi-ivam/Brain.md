import React from 'react';
import { SpotlightSearch } from './SpotlightSearch';
import { VaultDrawer } from './VaultDrawer';
import { ReviewDrawer } from './ReviewDrawer';
import { SlideViewerModal } from './Slides';
import { WeaveModal } from './Graph/WeaveModal';
import {
  Topic,
  GraphNode,
  KnowledgeGraphData,
  DifficultyLevel,
  GraphWeaveResponse,
} from '../types';
import { exportObsidianVaultUrl } from '../services/api';

interface AppModalsProps {
  // Spotlight
  isSpotlightOpen: boolean;
  onCloseSpotlight: () => void;
  isLoading: boolean;
  activeTopicId: string | null;
  graphData: KnowledgeGraphData | null;
  handleCreateTopic: (query: string, difficulty: DifficultyLevel) => Promise<void>;
  handleSelectNode: (node: GraphNode, targetTab?: any) => void;
  onOpenWeaveWithPrompt: (query: string) => void;

  // Vault
  isVaultOpen: boolean;
  topics: Topic[];
  loadGraph: (topicId: string) => void;
  handleDeleteTopic: (topicId: string) => void;
  handleTopicImported: (topicId: string) => void;
  onCloseVault: () => void;
  onOpenSpotlightFromVault: () => void;

  // Review
  isReviewDrawerOpen: boolean;
  onCloseReviewDrawer: () => void;
  onReviewCompleted: (fullGraph: KnowledgeGraphData) => void;
  onUpdateNodeMastery: (nodeId: string, masteryScore: number) => void;

  // Slides
  slidesModalNode: GraphNode | null;
  difficulty: DifficultyLevel;
  onCloseSlides: () => void;

  // Weave
  isWeaveModalOpen: boolean;
  weaveInitialPrompt: string;
  onCloseWeave: () => void;
  onWeaveSuccess: (res: GraphWeaveResponse) => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  isSpotlightOpen,
  onCloseSpotlight,
  isLoading,
  activeTopicId,
  graphData,
  handleCreateTopic,
  handleSelectNode,
  onOpenWeaveWithPrompt,

  isVaultOpen,
  topics,
  loadGraph,
  handleDeleteTopic,
  handleTopicImported,
  onCloseVault,
  onOpenSpotlightFromVault,

  isReviewDrawerOpen,
  onCloseReviewDrawer,
  onReviewCompleted,
  onUpdateNodeMastery,

  slidesModalNode,
  difficulty,
  onCloseSlides,

  isWeaveModalOpen,
  weaveInitialPrompt,
  onCloseWeave,
  onWeaveSuccess,
}) => {
  return (
    <>
      {/* Spotlight Overlay Modal */}
      {isSpotlightOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={onCloseSpotlight}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <SpotlightSearch
              onSearch={handleCreateTopic}
              isLoading={isLoading}
              onClose={onCloseSpotlight}
              isOverlay={true}
              activeTopicId={activeTopicId}
              activeTopicTitle={graphData?.topic.title}
              onSelectNode={(nodeId, targetTab) => {
                const n = graphData?.nodes.find((node) => node.id === nodeId);
                if (n) {
                  handleSelectNode(n, targetTab);
                }
              }}
              onOpenWeave={onOpenWeaveWithPrompt}
            />
          </div>
        </div>
      )}

      {/* Vault Manager Drawer */}
      <VaultDrawer
        isOpen={isVaultOpen}
        topics={topics}
        activeTopicId={activeTopicId || undefined}
        onSelectTopic={loadGraph}
        onDeleteTopic={handleDeleteTopic}
        onExportTopic={(id) => {
          window.location.href = exportObsidianVaultUrl(id);
        }}
        onTopicImported={handleTopicImported}
        onClose={onCloseVault}
        onNewTopic={onOpenSpotlightFromVault}
      />

      {/* Spaced Repetition Review Deck */}
      <ReviewDrawer
        isOpen={isReviewDrawerOpen}
        topicId={activeTopicId || undefined}
        topicTitle={graphData?.topic.title}
        onClose={onCloseReviewDrawer}
        onReviewCompleted={onReviewCompleted}
        onUpdateNodeMastery={onUpdateNodeMastery}
      />

      {/* Global Slide Viewer Modal */}
      {slidesModalNode && (
        <SlideViewerModal
          node={slidesModalNode}
          difficulty={difficulty}
          isOpen={!!slidesModalNode}
          onClose={onCloseSlides}
        />
      )}

      {/* Smart Graph Weave Modal */}
      <WeaveModal
        isOpen={isWeaveModalOpen}
        topicId={activeTopicId || ''}
        topicTitle={graphData?.topic.title}
        initialPrompt={weaveInitialPrompt}
        onClose={onCloseWeave}
        onWeaveSuccess={onWeaveSuccess}
      />
    </>
  );
};
