# BinnenApp

Zelfstandige Windows-app voor de binnenploeg van Janssen Bouw, gebaseerd op BuitenApp 2.2.75. De bediening is behouden; de naam, blauwe huisstijl, het icoon, lokale instellingen en database zijn zelfstandig.

## Projecten

- GitHub: https://github.com/ReinJanssenBouw/BinnenApp (privé)
- Supabase: https://supabase.com/dashboard/project/guurncfxhcxwvgnzoeyp
- Windows-installatie: `dist/BinnenApp-Setup-1.0.0.exe`

## Ingericht en gecontroleerd

- Eigen database met 15 tabellen en 79 functies, ledencontrole en afgeschermde PDF-opslag.
- 108 artikelen gekopieerd; voorraad nul; geen oude bestellingen of gebruikers gekopieerd.
- Voorraad, winkelwagen, bestellen, leverdatum, retouren en rechten getest met teruggedraaide testdata.
- Desktop-backend getest met echte aanmelding, accountbeheer en artikelgegevens; testaccount verwijderd.
- Supabase security advisor: geen bevindingen na het aanscherpen van de overgenomen rechten.
- Aanmeldscherm visueel gecontroleerd; geen browserconsolefouten.

## Nog nodig voor volledige ingebruikname

1. Eerste beheerdersaccount: registreer rein@janssen-bouw.nl in BinnenApp en bevestig het e-mailadres. Daarna krijgt dit account automatisch beheertoegang.
2. Mail: stel `RESEND_API_KEY`, `ORDER_MAIL_FROM` en `ORDER_MAIL_NOTIFY` in bij Supabase Edge Function secrets. Er zijn geen testmails verzonden.
3. OneDrive/Power Automate: een eigen flow, geheime URL en bijpassende allowlist in `copy-order-confirmation` zijn nog nodig. De PDF-kopieertaak blijft uit totdat dit is ingesteld; gewone PDF-opslag in BinnenApp werkt afzonderlijk.
4. Automatische updates: de repository is privé. De bestaande GitHub-updater heeft een publiek bereikbare releasefeed nodig; geef geen GitHub-toegangstoken mee in de app. Installer en updatepublicatie moeten hierop worden afgestemd.
5. De aparte mobiele BuitenApp-site is niet als BinnenApp-site gepubliceerd.

## Ontwikkeling

```sh
npm ci
npm start
npm run dist -- --win --publish never
```

`supabase/migrations` bevat het volledige beginschema. `supabase/bronmigraties` bevat alleen historische naslag; voer die bestanden niet opnieuw uit. API-servergeheimen worden uitsluitend in Supabase ingesteld. De desktop bevat alleen de publieke projectsleutel.

## Logo

`BinnenAppLogo.png` is gemaakt met de ingebouwde imagegen-tool, op basis van het bestaande BuitenApp-logo. Opdracht: behoud het ronde huislogo, de witte binnenkant en vier ramen; verander groen/turquoise naar blauw (#3b82f6–#1e40af), zonder tekst of nieuwe elementen, met transparante buitenkant. Het Windows-icoon is daarvan op 256 pixels gemaakt. De witte logovariant blijft op de blauwe appachtergrond staan.

