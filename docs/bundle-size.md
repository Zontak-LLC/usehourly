# Worker bundle size

Written by `npm run measure:bundle` after `npx opennextjs-cloudflare build`. Each run overwrites this file; compare
with the git history of the file.

- Date: 2026-10-25
- Commit: 293c1b6
- Raw: 12614704 bytes (12.03 MB)
- Gzip: 3964675 bytes (3.78 MB)

## Top 20 inputs of handler.mjs

Grouped by npm package or by `.next/server` chunk. Bytes are esbuild's bytesInOutput. Percent is of their sum
(12613755 bytes), which is not the raw file size: OpenNext edits handler.mjs after esbuild writes the metafile.

| # | group | bytes | MB | % |
| --: | :-- | --: | --: | --: |
| 1 | next | 2466900 | 2.35 | 19.6% |
| 2 | chunks/ssr/[root-of-the-server]__1ezfxml70nqh7._.js | 970415 | 0.93 | 7.7% |
| 3 | chunks/ssr/[root-of-the-server]__1mkodjpy42xyx._.js | 954934 | 0.91 | 7.6% |
| 4 | chunks/_1q5tf7zr-j954._.js | 558461 | 0.53 | 4.4% |
| 5 | chunks/_1p62ezew2zrws._.js | 558451 | 0.53 | 4.4% |
| 6 | chunks/[root-of-the-server]__0d4bnjjut0jds._.js | 433687 | 0.41 | 3.4% |
| 7 | chunks/ssr/_13dswl9edjid3._.js | 377957 | 0.36 | 3.0% |
| 8 | chunks/ssr/_1285fh8h4zjbp._.js | 377955 | 0.36 | 3.0% |
| 9 | chunks/ssr/[root-of-the-server]__0dfgh3_wvni0-._.js | 224573 | 0.21 | 1.8% |
| 10 | @prisma/client | 222524 | 0.21 | 1.8% |
| 11 | react-dom | 214144 | 0.20 | 1.7% |
| 12 | chunks/_0b7e517itr53e._.js | 201106 | 0.19 | 1.6% |
| 13 | chunks/_05d-rqbe44u4v._.js | 201105 | 0.19 | 1.6% |
| 14 | .prisma | 166045 | 0.16 | 1.3% |
| 15 | chunks/_1aebaeo292edq._.js | 135437 | 0.13 | 1.1% |
| 16 | chunks/_210w62dqbnl4a._.js | 135435 | 0.13 | 1.1% |
| 17 | chunks/ssr/[root-of-the-server]__16ifdi2pjx38e._.js | 129103 | 0.12 | 1.0% |
| 18 | chunks/ssr/node_modules_next_dist_02bgybbfs4pls._.js | 124171 | 0.12 | 1.0% |
| 19 | chunks/node_modules_zod_v4_classic_external_0psxhnnl72hht.js | 122277 | 0.12 | 1.0% |
| 20 | chunks/node_modules_zod_v4_classic_external_0watvdz5zdns0.js | 122277 | 0.12 | 1.0% |
