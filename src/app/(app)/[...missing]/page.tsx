import { notFound } from "next/navigation";

// Any unknown address (one segment or more, so never `/`) renders the (app) 404 with this request's nonce. With two
// root layouts there is no app-wide not-found page, and the static `/` layout must not be the one that shows it.
export default function MissingPage() {
  notFound();
}
