# MD Viewer

Next.js App Router starter with TypeScript, Tailwind CSS v4, ESLint, and shadcn/ui (Base UI, Nova style, neutral theme).

## Development

```sh
npm install
npm run dev
```

Open http://localhost:3000. Edit `src/app/page.tsx` to get started.

## Checks and production

```sh
npm run lint
npm run typecheck
npm run build
npm start
```

Run the build before starting the production server.

## UI components

```sh
npx shadcn@latest add card
```

Components live in `src/components/ui`; theme variables are in `src/app/globals.css`, and aliases are configured in `components.json`. A Button component is included and used on the starter page.

Setup references: [Next.js](https://nextjs.org/docs/app/getting-started/installation) and [shadcn/ui](https://ui.shadcn.com/docs/installation/next).
