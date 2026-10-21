/**
 * The Team page lists one card per person in two columns, then the "Invite someone" card. When the people fill whole
 * rows (none, two, four...) the invite card would sit alone at half width with empty space beside it, so it spans both
 * columns instead, like the "Add a project" card on Clients. With an odd number it sits next to the last person.
 */
export type InviteSlotShape = "empty-state" | "wide" | "beside";

export function inviteSlotShape(people: number): InviteSlotShape {
  if (people === 0) return "empty-state";
  return people % 2 === 0 ? "wide" : "beside";
}
