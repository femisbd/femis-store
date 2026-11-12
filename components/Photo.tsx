import Image from "next/image";

// Shows the real photo when a path is given, otherwise a labelled placeholder box.
export function Photo({ src, alt, label = "Product photo", sizes = "(max-width: 860px) 50vw, 25vw", priority = false }: {
  src?: string; alt: string; label?: string; sizes?: string; priority?: boolean;
}) {
  if (!src) return <div className="ph" role="img" aria-label={`${alt} (photo coming soon)`}>{label}</div>;
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} style={{ objectFit: "cover" }} />;
}
