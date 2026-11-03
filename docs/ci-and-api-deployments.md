# CI evidence reuse and API runtime image

The `CI` workflow still runs on pull requests and pushes to `dev` and
`production`. Both existing check names remain unchanged, including the
protected `Build API and Web` check. Railway's Wait for CI, pre-deploy database
migrations, and `/health` check remain enabled.

## Reusing validation

Each job first tests the reuse detector, then queries GitHub using read-only
Actions and repository permissions. A previous run is evidence only when:

- It is a successful, completed push to `dev` or `production` in this repository,
  using the same workflow ID and `.github/workflows/ci.yml` path.
- It was created within the last 24 hours.
- Its complete Git tree equals the current checkout's tree. This includes
  application code, tests, dependency locks, scripts, and the workflow itself.
- Both jobs actually completed all required validation steps successfully,
  including runtime pruning and verification. A run that reused evidence cannot
  itself become evidence, because its validation steps were skipped.

The current jobs always execute and produce new checks for the current commit.
On reuse, their summaries link to the successful source run. Missing or stale
evidence, changed content, forks, lookup failures, or a failed detector step all
fall back to the complete validation suite. Detector regression tests must pass
even when the rest of the job reuses evidence.

Only push runs can be evidence: a pull request normally tests a synthetic merge,
whose tree cannot be inferred from the PR's head SHA. The current checkout tree
is read from Git directly. Queries have a bounded time budget; an unavailable
GitHub API must not turn into an approval or an unbounded deployment wait.

To force a fresh complete validation, run `CI` manually with **Run workflow**.
Manual dispatch is never eligible for reuse. Do not use `[skip ci]` or remove the
push event to accelerate a release: the published commit still needs checks.

## Runtime image

The API installs its workspace once, including development tools needed to
compile. After Prisma generation and the Nest build, a separate runtime step
prunes development dependencies and verifies that the compiled application,
Prisma, native modules, migrations, and PDF resources remain usable.

The deployed image contains only Node's runtime, production dependencies, root
manifests, and the API's compiled output, package manifest, Prisma files and
assets. Web source, API source/tests, docs, build caches, and maintenance/import
scripts are not runtime inputs. Prisma CLI remains a production dependency so
the pre-deploy migration command works without downloading a replacement.

Railpack is pinned to `0.43.0` because its generated Node runtime paths are
explicit in `railpack.json`. When upgrading it, regenerate and inspect the plan
and repeat runtime verification before changing this pin.

The full CI job also prunes and verifies runtime dependencies after all API and
web validations finish. This catches future accidental runtime imports from
development-only dependencies.

## Measurement

Record CI duration separately from Railway's build, image transfer, pre-deploy,
and healthcheck timestamps. Compare the pushed source tree with the evidence
run, and verify real jobs show a reuse hit. The first run after changing this
workflow must run the complete suite; a later identical push can reuse it.

Measure final image bytes as well as deployment seconds. Builder scheduling,
cache availability and image transfers vary between runs, so one measurement
does not establish a permanent latency guarantee.
