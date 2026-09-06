import { useEffect } from 'react';

interface KeyboardShortcutsOptions {
  isSpotlightOpen: boolean;
  isVaultOpen: boolean;
  hasSelectedNode: boolean;
  onToggleSpotlight: () => void;
  onCloseSpotlight: () => void;
  onCloseVault: () => void;
  onClearSelection: () => void;
  onDeleteSelectedNode?: () => void;
}

export const useKeyboardShortcuts = ({
  isSpotlightOpen,
  isVaultOpen,
  hasSelectedNode,
  onToggleSpotlight,
  onCloseSpotlight,
  onCloseVault,
  onClearSelection,
  onDeleteSelectedNode,
}: KeyboardShortcutsOptions) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onToggleSpotlight();
      } else if (e.key === 'Escape') {
        if (isSpotlightOpen) {
          onCloseSpotlight();
        } else if (isVaultOpen) {
          onCloseVault();
        } else if (hasSelectedNode) {
          onClearSelection();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
        if (tag !== 'input' && tag !== 'textarea' && !isEditable && hasSelectedNode && onDeleteSelectedNode) {
          e.preventDefault();
          onDeleteSelectedNode();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isSpotlightOpen,
    isVaultOpen,
    hasSelectedNode,
    onToggleSpotlight,
    onCloseSpotlight,
    onCloseVault,
    onClearSelection,
    onDeleteSelectedNode,
  ]);
};
