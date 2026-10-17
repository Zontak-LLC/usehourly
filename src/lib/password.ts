import { compare } from "bcryptjs";

// A real bcrypt hash of a random string. Compared against when there is no such account, so refusing
// an unknown address takes as long as refusing a wrong password and the response time does not
// reveal which accounts exist.
export const DUMMY_HASH = "$2b$10$/d71ePEchCyYCB6eaMwpduTW0t71unFdrj8.qVJaEa8/rorCde0VG";

/** Checks a password against an account's hash (or against the dummy hash when there is no account). */
export async function passwordMatches(plain: string, hash: string | null | undefined): Promise<boolean> {
  const ok = await compare(plain, hash ?? DUMMY_HASH);
  return Boolean(hash) && ok;
}
