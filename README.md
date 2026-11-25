# Globe Trans Management System (prototype)

A clickable sales prototype of a logistics and transport management system for Globe Trans:
shipments, fleet, drivers, customers, tracking, reports and settings, using realistic Tanzanian
sample data in TZS.

## Run it

Requires Node.js 18.18 or newer.

```bash
npm install
npm run dev          # development server at http://localhost:3000
```

Production build:

```bash
npm run build
npm run start        # serves the production build at http://localhost:3000
```

## How the demo works

- All data is local sample data, generated on first load and saved in the browser (localStorage).
  Changes survive a page reload. **Settings → Reset demo data** restores the original records
  before a presentation.
- Sample dates are generated relative to today, so the dashboard always looks current.
- Tracking positions are estimated from dispatch time and route checkpoints on a schematic
  corridor map. There is no live GPS; that would come from vehicle telematics.
- There is no backend, authentication or payment processing.

## Structure

- `app/` pages: dashboard (`/`), `shipments`, `fleet`, `drivers`, `customers`, `tracking`, `reports`, `settings`
- `components/` app shell, shared UI kit (`ui.tsx`), SVG charts, shipment dialogs, route map
- `lib/` types, sample-data generator (`seed.ts`), road network and pricing (`geo.ts`),
  derived metrics (`derive.ts`), state and persistence (`store.tsx`), toasts
- Visual language follows the Globe Trans design system: petrol and road-marking amber, Archivo type.
# globe
