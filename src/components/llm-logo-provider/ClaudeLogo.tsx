import React from 'react';

type ClaudeLogoProps = {
  className?: string;
};

const ClaudeLogo = ({ className = 'w-5 h-5' }: ClaudeLogoProps) => {
  const baseUrl = import.meta.env.BASE_URL;

  return (
    <img src={`${baseUrl}icons/claude-ai-icon.svg`} alt="Claude" className={className} />
  );
};

export default ClaudeLogo;

