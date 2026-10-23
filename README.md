# AmpCore

Desktop-first control and monitoring app for networked amplifier devices.

This project combines:

- Next.js App Router for the UI and local API routes
- Electron for desktop packaging and runtime
- Zustand stores for project/device state
- UDP-based device communication through server-side libs in `lib/`

## Features

- Project-based amplifier assignment
- Device discovery/scanning
- Live monitoring and amp control
- Matrix/Limiter view
- Preset recall/store workflow
- Electron packaging for Windows and macOS

## Phone Remote

Control output levels, mutes and one shared "system" input EQ from an iPhone, iPad or any phone browser.

1. Start the AmpCore desktop app on a computer on the same network as the amps.
2. Click the phone icon in the header. It shows an address, a QR code and a 6-digit PIN.
3. Scan the QR code with the phone (or type the address into Safari) and enter the PIN.
4. Optional: in Safari tap Share › Add to Home Screen to open it like an app.

On macOS the first start asks whether AmpCore may accept incoming network connections. Click **Allow**, or phones can't connect.

What the remote can do:

- **Levels:** a fader, ±1 dB buttons and a mute per output channel, plus ±1 dB for all channels at once.
- **System EQ:** a 10-band EQ (high-pass, 8 parametric bands, low-pass) that is pushed to the input EQ of every input you select. Drag the points on the curve, or pick a band and use the sliders. It replaces the input EQ on those inputs; output EQ and speaker presets are never touched. Use **Resend to amps** after an amp was power-cycled or its input EQ was changed elsewhere.

How it is wired:

- The app's own server only listens on `127.0.0.1:3000`.
- `electron/remote-gateway.js` listens on port `8787` on the local network, requires the PIN (remembered by the phone for 30 days), rate-limits wrong PINs, and only forwards `/remote`, its assets and `/api/remote/*`.
- `/api/remote/control` accepts only volume and mute commands. Everything else stays desktop-only.
- The PIN and port are stored in `remote-access.json` in the app's user-data folder. "New PIN" signs out every phone.

## macOS Note

The app is not notarized with Apple. After downloading and extracting the zip, macOS may block it.  
Run this command in Terminal to fix it:

```bash
xattr -cr ~/Downloads/AmpCore.app
```

Then open the app normally.

## Requirements

- Node.js 20+
- pnpm

## Install

```bash
pnpm install
```

## Development

Run the web app only:

```bash
pnpm dev
```

Run Next.js + Electron together (desktop dev mode):

```bash
pnpm electron:dev
```

### Demo Simulation Mode

When creating a project, choose `Demo Amps` as project mode.

Demo projects use simulated amps only, while real projects use real discovered amps only.

In demo projects, the app uses simulated amps for:

- `/api/scan` (discoverable demo devices)
- `/api/amp-events` (live discovery + heartbeat SSE)
- `/api/amp-channel-data` (synthetic FC=27 payload)
- `/api/amp-actions` (stateful simulated command handling)
- `/api/amp-runtime/[mac]` (synthetic runtime minutes)

Current default simulated models:

- DSP-1002 (2 analog in, 2 out)
- DSP-1004 (4 analog in, 4 out)
- DSP-1002D (2 analog in, 2 out, 2 dante in)
- DSP-1004D (4 analog in, 4 out, 4 dante in)

## Build

Build the Next.js app:

```bash
pnpm build
```

Create a Windows Electron installer:

```bash
pnpm electron:build
```

## Lint

```bash
pnpm lint
```

## Key Routes

- `/monitor` - project monitor and amp control UI
- `/api/*` - internal API routes for scan/runtime/actions/presets/projects

## Storage

- Project data is stored under `storage/projects/`
- In Electron production, user-data paths are resolved by the Electron process

## Tech Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS 4
- shadcn/ui primitives
- Electron + electron-builder

## License

MIT (see `LICENSE`)
