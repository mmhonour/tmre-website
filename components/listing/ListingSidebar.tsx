import ListingDetailsSchoolsPanel, {
  type ListingDetailsSchoolsPanelProps,
} from "@/components/listing/ListingDetailsSchoolsPanel";
import ListingHeroPhoto, {
  type ListingHeroPhotoProps,
} from "@/components/listing/ListingHeroPhoto";

export default function ListingSidebar({
  details,
  heroPhoto = null,
  unframed = false,
}: {
  details: ListingDetailsSchoolsPanelProps;
  heroPhoto?: ListingHeroPhotoProps | null;
  unframed?: boolean;
}) {
  return (
    <div className="space-y-6 min-w-0">
      {heroPhoto ? (
        <ListingHeroPhoto {...heroPhoto} unframed={unframed} />
      ) : null}

      <ListingDetailsSchoolsPanel {...details} unframed={unframed} />
    </div>
  );
}
