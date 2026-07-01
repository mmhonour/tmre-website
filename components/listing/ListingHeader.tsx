type ListingHeaderProps = {
  mlsId: string;
  status: string;
  dom: number | null;
  address: {
    street: string;
    full: string;
    city: string;
    state: string;
    postalCode: string;
  };
  propertyType: string;
  style: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
};

export default function ListingHeader({
  mlsId,
  status,
  dom,
  address,
  propertyType,
  style,
  beds,
  baths,
  sqft,
  yearBuilt,
  className = "",
}: ListingHeaderProps & { className?: string }) {
  return (
    <div className={className ? className : "mb-6"}>
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
          #{mlsId} · {status}
        </span>
        {dom != null && (
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/55">
            {dom}d on market
          </span>
        )}
      </div>
      <h1 className="font-serif text-3xl lg:text-4xl text-white leading-tight">
        {address.street || address.full}
      </h1>
      <p className="text-white/65 mt-2">
        {[address.city, address.state, address.postalCode].filter(Boolean).join(" ")}
      </p>
      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/45 mt-3">
        {[
          propertyType?.replace(/ For Sale$/i, ""),
          style,
          beds && baths ? `${beds}BR/${baths}BA` : null,
          sqft ? `${sqft.toLocaleString()} sqft` : null,
          yearBuilt ? `Built ${yearBuilt}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}
