import { SlideType } from '../../types';

export interface SlideTypeConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export const SLIDE_TYPE_META: Record<SlideType, SlideTypeConfig> = {
  title: { label: 'Overview', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.3)' },
  concept: { label: 'Core Concept', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.12)', border: 'rgba(129, 140, 248, 0.3)' },
  math: { label: 'Mathematical Formalism', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' },
  mechanism: { label: 'Dynamics & Mechanism', color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.12)', border: 'rgba(45, 212, 191, 0.3)' },
  applications: { label: 'Frontiers & Applications', color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)', border: 'rgba(52, 211, 153, 0.3)' },
  pitfalls: { label: 'Pitfalls & Edge Cases', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.3)' },
  summary: { label: 'Synthesis & Self-Check', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.12)', border: 'rgba(192, 132, 252, 0.3)' },
};
