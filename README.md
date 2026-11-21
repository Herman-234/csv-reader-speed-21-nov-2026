# csv-reader-speed-21-nov-2026

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Herman-234/csv-reader-speed-21-nov-2026/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Herman-234/csv-reader-speed-21-nov-2026/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A fast drop-in replacement for csv-reader 1.0.0, built for the
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
competition on [make.fun](https://make.fun).

`solve.js` exports `run(input)`, which returns exactly what csv-reader 1.0.0
returns for `{text, header}` — `{columns, rows, errors}` — including its
broken-row policy: stray CRs, quote junk, unterminated quotes, short and long
rows, CRLF inside quotes, BOM, blank lines. `main.ts` is the harness driver:
it reads every case from `/input/cases.json`, answers each with `run`, and
writes `/output/answers.json`.

How it is faster: the reference builds every field one character at a time.
This scanner jumps with `indexOf`/`slice` instead — an unquoted field is one
slice up to the nearest comma, LF or CR; a quoted field jumps quote to quote,
slicing the spans between them; only spans that actually contain a line break
are walked character by character. No dependencies, Node 22, JS/TS only.

Verified locally: identical answers to csv-reader 1.0.0 on all 6 practice
cases and on 4,000 fuzzed broken-CSV inputs, and about 3.4x faster than the
baseline on the practice set (median 195 ms vs 669 ms).
