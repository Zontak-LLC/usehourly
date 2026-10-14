import "next-auth";

declare module "next-auth" {
  interface User {
    /** The account's token_version when this sign-in happened. */
    tv?: number;
  }
  interface Session {
    user: {
      id: string;
      /** token_version carried by the sign-in token. */
      tv?: number;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
