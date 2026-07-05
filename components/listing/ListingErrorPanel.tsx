export default function ListingErrorPanel({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-lg mx-auto text-center py-24">
      <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-coral mb-4">
        Error
      </p>
      <h1 className="font-serif text-3xl text-white">{title}</h1>
      <p className="text-white/70 mt-4">{body}</p>
    </div>
  );
}
