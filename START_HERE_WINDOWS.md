# Start NeighbourHelp on Windows

The screenshot you shared is correct: Windows Explorer is hiding known file extensions. For example, `package` is `package.json`, `README` is `README.md`, and `vite.config` is `vite.config.ts`.

This is a Node.js web project, so it cannot be started by double-clicking `package.json`. Use the included launcher or a terminal.

## Recommended method

1. Extract the ZIP into a folder named `neighbourhelp`.
2. Install **Node.js 20 or newer** from <https://nodejs.org/>.
3. Open the extracted folder.
4. Double-click `START_NEIGHBOURHELP_WINDOWS.bat`.
5. Open <http://localhost:3000> when the terminal says the server is running.

The batch file installs dependencies the first time and starts the development server on later runs.

## Terminal method

Open PowerShell in the folder containing `package.json`, then run:

```powershell
corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm install
pnpm dev
```

Then open <http://localhost:3000>.

## Required configuration

Copy the variables shown in `ENVIRONMENT_SETUP.md` into a new file named `.env` in this same folder. Firebase login, MySQL persistence, and the administrator panel require real project configuration values. Do not rename `.env` to `.env.txt`.

The project folders are expected to remain together:

```text
neighbourhelp/
  package.json
  client/
  server/
  database/
  shared/
```

Do not open or move only the `client`, `server`, or `database` folder. Always run commands from the folder that contains `package.json`.

## Verify the installation

```powershell
pnpm check
pnpm test
pnpm build
```

All three commands should complete successfully before deployment.
