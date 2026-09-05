import React from 'react';
import { renderInlineMathHtml } from '../utils/mathRenderer';

interface MathTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

export const MathText: React.FC<MathTextProps> = ({ text, className, style }) => {
  const html = renderInlineMathHtml(text);
  return (
    <span
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
