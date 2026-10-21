"use client";

import { useEffect, useRef, useState } from "react";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type Crop,
  cropRect,
  frameStyle,
  initialCrop,
  MAX_ZOOM,
  panCrop,
  type Size,
  zoomCrop,
} from "@/lib/avatar-crop";
import { renderAvatar } from "@/lib/logo";

/** The round frame, in screen pixels. Fits the narrowest phones with the dialog's own padding. */
const FRAME = 240;
const KEY_STEP = 12;

export type CropRequest = {
  /** The chosen file, as a temporary address the browser can show. */
  src: string;
  /** Called with the finished 128x128 picture. */
  onSave: (dataUrl: string) => Promise<void> | void;
  onCancel: () => void;
  busy?: boolean;
};

/**
 * "Adjust your picture": the chosen image inside a round frame like the one it will be shown in. Drag it to move it, use
 * the slider (or the arrow keys and + / -) to zoom, then save. Nothing is saved until the button is pressed.
 */
export function AvatarCropper({ crop }: { crop: CropRequest | null }) {
  return (
    <Dialog open={crop !== null} onOpenChange={(open) => !open && crop?.onCancel()}>
      <DialogContent className="max-w-sm">{crop && <CropBody key={crop.src} {...crop} />}</DialogContent>
    </Dialog>
  );
}

function CropBody({ src, onSave, onCancel, busy }: CropRequest) {
  const imgEl = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [failed, setFailed] = useState(false);

  // A new file starts in the middle again.
  useEffect(() => {
    setSize(null);
    setCrop(null);
    setFailed(false);
  }, []);

  const ready = size !== null && crop !== null;
  const style = ready ? frameStyle(size, crop, FRAME) : undefined;

  function move(dx: number, dy: number) {
    if (size && crop) setCrop(panCrop(size, crop, dx, dy, FRAME));
  }
  function zoom(to: number) {
    if (size && crop) setCrop(zoomCrop(size, crop, to));
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Adjust your picture</DialogTitle>
        <DialogDescription>
          Drag to move it, use the slider to zoom. The circle is what people will see.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center gap-4">
        {/* biome-ignore lint/a11y/useSemanticElements: a drag surface for a picture with arrow-key support; no native element fits */}
        <div
          role="group"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: it must take keyboard focus so the picture can be moved with the arrow keys
          tabIndex={0}
          aria-label="Picture position. Drag, or use the arrow keys to move and plus and minus to zoom."
          data-no-swipe
          className="relative cursor-grab touch-none overflow-hidden rounded-full border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/40 active:cursor-grabbing"
          style={{ width: FRAME, height: FRAME }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            move(e.clientX - drag.current.x, e.clientY - drag.current.y);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? KEY_STEP * 3 : KEY_STEP;
            const keys: Record<string, [number, number]> = {
              ArrowLeft: [step, 0],
              ArrowRight: [-step, 0],
              ArrowUp: [0, step],
              ArrowDown: [0, -step],
            };
            if (keys[e.key]) {
              e.preventDefault();
              move(...keys[e.key]);
            } else if ((e.key === "+" || e.key === "=") && crop) zoom(crop.zoom + 0.2);
            else if (e.key === "-" && crop) zoom(crop.zoom - 0.2);
          }}
        >
          {/* biome-ignore lint/performance/noImgElement: a temporary local file, nothing to optimize */}
          <img
            ref={imgEl}
            src={src}
            alt="Your picture, to be positioned"
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={style ?? { opacity: 0 }}
            onLoad={(e) => {
              const s = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight };
              setSize(s);
              setCrop(initialCrop(s));
            }}
            onError={() => setFailed(true)}
          />
        </div>

        {failed ? (
          <p role="alert" className="text-destructive text-sm">
            Couldn't read that image. Try another file.
          </p>
        ) : (
          <div className="flex w-full max-w-60 items-center gap-2">
            <Minus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="range"
              aria-label="Zoom"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={crop?.zoom ?? 1}
              disabled={!ready}
              onChange={(e) => zoom(Number(e.target.value))}
              className="h-6 w-full accent-primary"
            />
            <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!ready || busy || !imgEl.current}
          onClick={() => {
            if (!size || !crop || !imgEl.current) return;
            void onSave(renderAvatar(imgEl.current, cropRect(size, crop)));
          }}
        >
          {busy ? "Saving…" : "Save picture"}
        </Button>
      </div>
    </>
  );
}
