# mockfly

Serve your [Mockfly](https://app.mockfly.dev) mock APIs locally — fully offline.

Pull your projects once while you have internet, then keep mocking on the plane, on the train, or anywhere without a connection. Responses are produced by the same engine Mockfly runs in production: conditional rules, Faker templating, URL/body/header/env placeholders, delays, XML, the lot.

```bash
# while online
npx mockfly login          # paste an API key from the Mockfly dashboard
npx mockfly pull           # downloads all your projects to ./mockfly/*.json

# from now on, no internet needed
npx mockfly serve
```

```
Mockfly serving 2 projects on http://localhost:4000

  User API                 http://localhost:4000/user-api (pulled just now)
                           http://localhost:4000/d3f1…-… — 4 endpoints
  Payments Mock            http://localhost:4000/payments-mock (pulled just now)
                           http://localhost:4000/9a2c…-… — 6 endpoints
```

Every project is mounted under its slug (same as production) and under a friendly alias derived from its name.

## Commands

| Command | What it does |
| --- | --- |
| `mockfly login` | Save your account API key (`mf_…`, created in the dashboard) to `~/.mockfly/config.json` |
| `mockfly pull [projects...]` | Download all your projects — or just the named ones — to `./mockfly/` |
| `mockfly serve [--port 4000]` | Serve every pulled project locally, offline |
| `mockfly list` | Show what is pulled and how stale it is |
| `mockfly rm <project>` | Remove a pulled project |
| `mockfly whoami` / `logout` | Inspect / clear the saved credentials |

All commands accept `--dir <dir>` to use a workspace other than `./mockfly`.

## How it works

`pull` snapshots each project (endpoints, responses, rules, environment variables) into a plain JSON file. `serve` loads those files into memory and answers requests with a local copy of the Mockfly response engine. Nothing is written back: the files are read-only snapshots — to change your mocks, edit them in the Mockfly web app and `pull` again.

- The snapshot format is a superset of Mockfly's import format, so a pulled file can be re-imported.
- Endpoints configured as proxies are served as mocks (there is no network offline); a note is printed.
- Requests are logged to stdout instead of the cloud dashboard.

## Security notes

- `mockfly login` stores your API key in plaintext at `~/.mockfly/config.json` (file mode `600`), like `~/.npmrc` or `~/.aws/credentials`. Use `mockfly logout` to remove it, and revoke keys from the Mockfly dashboard.
- Pulled files in `./mockfly/` include your project **environment variables**. If those hold secrets, add the workspace to `.gitignore` before committing — sharing the files shares the secrets.
- The local server binds to all interfaces like any Express app; it is meant for local development, not for exposing to the internet.

## Configuration

| | |
| --- | --- |
| `MOCKFLY_API_KEY` | API key (overrides the saved one) |
| `MOCKFLY_API_URL` | API base url (self-hosted / staging) |

## Development

```bash
yarn install
yarn test        # node --test: engine unit tests + e2e against a real local server
```
