import { router } from "../trpc";
import { passwordProcedures } from "./account-password";
import { profileProcedures } from "./account-profile";
import { sessionProcedures } from "./account-session";
import { signupProcedures } from "./account-signup";
import { tokenProcedures } from "./account-tokens";

export const accountRouter = router({
  ...signupProcedures,
  ...profileProcedures,
  ...passwordProcedures,
  ...sessionProcedures,
  ...tokenProcedures,
});
