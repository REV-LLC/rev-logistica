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

## One API image, two environments

The image delivery workflow is separate from `CI`. CI keeps its two existing
checks and its complete-tree evidence policy. A release builds the API once,
publishes a private Linux/amd64 image, and deploys its immutable
`ghcr.io/rev-llc/rev-logistica-api@sha256:…` reference to staging. Production can
receive that reference only after the staging deployment and smoke checks pass.
Tags are for locating builds; deployment decisions always use a digest.

The release identity includes the production commit, complete Git tree, successful
production CI run, delivery run and image digest. A newer production commit,
missing evidence, failed build, incorrect digest or failed staging check stops
promotion. An older successful CI run for different content cannot authorize a
release. Application changes from an unselected `dev` revision are never copied
into a delivery checkout.

Railpack stays pinned to `0.43.0`, including its BuildKit frontend. The build uses
the existing workspace install, compilation, prune and runtime checks. Only
synthetic build-time configuration is supplied; database connections, JWT
secrets and all other environment settings are resolved at runtime in Railway.
Each environment still executes its own Prisma migrations and `/health` check.
Image-based services receive the existing start, migration and health settings
explicitly, since the source repository's `railway.json` is no longer their
configuration source.

### Credentials and activation

GitHub Actions publishes with its short-lived `GITHUB_TOKEN` and `packages:write`.
The package must be verified private before application content is pushed. An
initial empty placeholder may create the package; it contains no application
code. An inaccessible or public package stops delivery.

Railway needs a durable read-only registry credential to pull private images
after the workflow has finished. Configure repository secret `GHCR_PULL_TOKEN`
with a classic GitHub token limited to `read:packages`, and repository variable
`GHCR_PULL_USERNAME` with the token owner's login. Authorize organization SSO
when required. Never put a token in source, logs, an artifact or a chat message.
The publishing job's temporary `GITHUB_TOKEN` must not become Railway's saved
registry password. GitHub documents these authentication requirements in its
[Container registry guide](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

Dedicated GitHub environments `railway-staging` and `railway-production` each
hold `RAILWAY_TOKEN`, scoped to the matching Railway project environment. Restrict
both GitHub environments to the `production` branch. Keep
`API_IMAGE_PROMOTION_ENABLED` disabled until credentials and the first controlled
delivery are verified. The CI completion listener dispatches the delivery on
`production`, so a default-branch listener does not receive deployment secrets.

Do not remove the current Git source before the initial image has passed CI and
can be pulled. The promotion script changes only the target API service in the
target environment using a direct configuration patch, without committing
unrelated staged Railway changes. The image source replaces Git auto-deployment
for that instance; subsequent releases use the delivery workflow.

For the first controlled delivery, dispatch **API image promotion** on
`production` with its complete `source_sha`, the successful production
`source_ci_run_id`, and `allow_initial_git_source=true`. The script requires a
healthy previous Git deployment that Railway can recover. Later automatic
deliveries leave that bootstrap input false.

Failed production deployments with a confirmed deployment ID and previous-image
evidence attempt a guarded recovery. A rejected deploy request can restore the
previous configuration without replacing its still-running container. A network
timeout without a provable new deployment ID requires an operator to reconcile
Railway state; the script does not guess. Recovery restores application code and
image, and does not reverse database migrations. The library's nullable
`invoiceNumber` migration remains compatible with the previous application.

### Timing evidence

Preserve delivery artifacts with the release identity, build duration, image
digest, staging and production deployment IDs, previous deployment references,
and health timestamps. Measure both total CI-to-production time and the
production promotion interval: sequential staging adds a real validation gate,
so avoiding a second build does not imply the whole release is faster than two
parallel builds in every run. Report observed reductions only after a successful
controlled deployment; pending activation has no measured speedup.
