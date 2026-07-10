function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((s) => s.trim()) ?? [trimmed];
}

export function ListingInsightCopy({
  text,
  className = "text-sm text-white/60 leading-relaxed",
}: {
  text: string;
  className?: string;
}) {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) {
    return <p className={className}>{text}</p>;
  }

  return (
    <div className="space-y-2">
      {sentences.map((sentence, index) => (
        <p key={index} className={className}>
          {sentence}
        </p>
      ))}
    </div>
  );
}
