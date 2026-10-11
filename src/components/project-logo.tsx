"use client";

import { trpc } from "@/lib/trpc";

/** {projectId: logo data URL}. One shared, cached query — logos never ride along with entries. */
export function useProjectLogos() {
  return trpc.project.logos.useQuery(undefined, { staleTime: 5 * 60_000 }).data ?? {};
}

/**
 * A project's logo if it has one, otherwise the client's color dot. Small and fixed-size so
 * rows don't shift when a logo is added.
 */
export function ProjectMark({
  projectId,
  color,
  size = 20,
  logos,
}: {
  projectId: string;
  color: string;
  size?: number;
  logos: Record<string, string>;
}) {
  const logo = logos[projectId];
  if (logo) {
    return (
      // biome-ignore lint/performance/noImgElement: a small data: URL, nothing to optimize
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-[4px] bg-white object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return <span className="shrink-0 rounded-full" style={{ width: 10, height: 10, backgroundColor: color }} />;
}
