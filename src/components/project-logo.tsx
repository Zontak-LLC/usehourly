"use client";

import { useMemo } from "react";

import { projectShades } from "@/lib/project-shade";
import { trpc } from "@/lib/trpc";

/** {projectId: logo data URL}. One shared, cached query — logos never ride along with entries. */
export function useProjectLogos() {
  return trpc.project.logos.useQuery(undefined, { staleTime: 5 * 60_000 }).data ?? {};
}

/**
 * `shade(projectId, clientColor)`: the project's own shade of its client's colour (lib/project-shade.ts), read from the
 * cached client list every page already loads; the client's colour until that list arrives or for a project not in it.
 */
export function useProjectShade() {
  const clients = trpc.clients.list.useQuery();
  const shades = useMemo(() => projectShades(clients.data ?? []), [clients.data]);
  return (projectId: string, clientColor: string) => shades.get(projectId) ?? clientColor;
}

/**
 * A project's logo if it has one, otherwise its colour dot (a shade of the client's colour). Small and fixed-size so
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
  const shade = useProjectShade();
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
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: 10, height: 10, backgroundColor: shade(projectId, color) }}
    />
  );
}
