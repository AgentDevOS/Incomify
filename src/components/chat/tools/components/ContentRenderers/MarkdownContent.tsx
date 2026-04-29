import React from 'react';
import type { Project } from '../../../../../types/app';
import { Markdown } from '../../../view/subcomponents/Markdown';

interface MarkdownContentProps {
  content: string;
  className?: string;
  selectedProject?: Project | null;
}

/**
 * Renders markdown content with proper styling
 * Used by: exit_plan_mode, long text results, etc.
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  className = 'mt-1 prose prose-sm max-w-none dark:prose-invert',
  selectedProject = null,
}) => {
  return (
    <Markdown className={className} selectedProject={selectedProject}>
      {content}
    </Markdown>
  );
};
