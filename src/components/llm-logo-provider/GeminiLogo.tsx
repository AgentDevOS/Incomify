const GeminiLogo = ({className = 'w-5 h-5'}) => {
  const baseUrl = import.meta.env.BASE_URL;

  return (
    <img src={`${baseUrl}icons/gemini-ai-icon.svg`} alt="Gemini" className={className} />
  );
};

export default GeminiLogo;
