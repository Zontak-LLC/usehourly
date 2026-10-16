/** Where "What should UseHourly connect to?" replies go. One constant, like DONATE_URL. */
export const FEEDBACK_EMAIL = "admin@zontakllc.com";

/** A mailto: link with the subject and a starter body filled in, so replying takes seconds. */
export function feedbackMailto(email: string = FEEDBACK_EMAIL): string {
  const subject = "UseHourly: what I'd like it to connect to";
  const body = "I'd like UseHourly to connect to:\n\nI'd use it to:\n";
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
