import "next-auth";

declare module "next-auth" {
  interface User {
    /** The account's token_version when this sign-in happened. */
    tv?: number;
    /** True for a "Try the demo" account (sample data, deleted after a day). */
    demo?: boolean;
  }
  interface Session {
    user: {
      id: string;
      /** token_version carried by the sign-in token. */
      tv?: number;
      /** True while this is a demo account; false once it has been turned into a real one. */
      demo?: boolean;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
