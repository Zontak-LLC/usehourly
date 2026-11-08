import { permanentRedirect } from "next/navigation";

import { helpAddressFor } from "@/content/help";

type Props = { params: Promise<{ slug: string }> };

/**
 * The old guide had a page per topic (/help/<slug>) and a FAQ page (/help/faq). They are one Help page now; an old
 * address opens the answer that replaced its topic, or searches for its words, so no link breaks. An old FAQ anchor
 * (/help/faq#free) keeps its #anchor through the redirect and the Help page opens that answer.
 */
export default async function OldGuideAddress({ params }: Props) {
  const { slug } = await params;
  permanentRedirect(slug === "faq" ? "/help" : helpAddressFor(slug));
}
