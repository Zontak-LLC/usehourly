import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Dummy SQLite URL for prisma generate — the runtime uses D1 bindings, not this URL.
    url: "file:./dev.db",
  },
});
