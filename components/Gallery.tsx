"use client";

import { useState } from "react";
import { Photo } from "./Photo";

export function Gallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0);
  // Until real photos are added, show four placeholder slots so the layout is visible.
  const slots: (string | undefined)[] = images.length ? images : [undefined, undefined, undefined, undefined];
  return (
    <div className="gallery">
      <div className="gallery-main">
        <Photo src={slots[i]} alt={`${name}, photo ${i + 1}`} label={`Product photo ${i + 1} of ${slots.length}`} sizes="(max-width: 860px) 100vw, 55vw" priority />
      </div>
      {slots.length > 1 && (
        <div className="thumbs" role="group" aria-label="Product photos">
          {slots.map((src, n) => (
            <button key={n} className="thumb" aria-label={`Show photo ${n + 1}`} aria-pressed={i === n} onClick={() => setI(n)}>
              {src ? <Photo src={src} alt="" sizes="120px" /> : n + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
