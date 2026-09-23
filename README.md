# BinnenApp

Zelfstandige kopie van BuitenApp 2.2.75 voor de binnenploeg, met blauwe huisstijl.

## Status

De desktopbroncode is overgezet. Supabase is nog niet ingericht: de tijdelijke
`.invalid`-URL voorkomt dat BinnenApp gegevens van BuitenApp wijzigt. De oude
Power Automate-koppelingen zijn verwijderd en moeten indien nodig apart worden
ingericht. De bestaande migraties zijn aanvullingen, geen volledig beginschema.
Voer ze nog niet uit voordat het volledige schema uit het oorspronkelijke
Supabase-project is overgenomen en de projectspecifieke configuratie is aangepast.

## Ontwikkeling

Na het instellen van het eigen Supabase-project in `supabase-backend.js`:

```sh
npm ci
npm start
```

Een installatiebestand bouwen: `npm run dist -- --win --publish never`.

BinnenApp gebruikt een eigen app-ID, lokale opslag en GitHub-updaterepository.
Publiceer pas een release nadat de nieuwe database, accountrechten en
bestelverwerking zijn gecontroleerd.
