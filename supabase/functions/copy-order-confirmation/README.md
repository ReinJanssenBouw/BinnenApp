# Automatische kopie van orderbevestigingen

Deze serverfunctie kopieert uitsluitend nieuwe, succesvol aan een BinnenApp-order
gekoppelde PDF's via de bestaande Power Automate-stroom. De gekozen bestemming is
Janssen Bouw → Documenten → Bestellingen en Prijzen → werkplaats.
De originele PDF blijft in de privébucket `order-confirmations`.

## Bestemming

Op 10 september 2026 is de bestemming op uitdrukkelijk verzoek van de gebruiker
gewijzigd van Mijn Bestanden → Documenten naar de werkplaatsmap:

- SharePoint-site: `https://janssenbouwbv.sharepoint.com/sites/Janssen-Bouw`
- Serverrelatief mappad in de Power Automate-acties voor namen en upload:
  `/sites/Janssen-Bouw/Gedeelde documenten/Bestellingen en Prijzen/werkplaats`
- Bestaande verbinding: `werkvoorbereiding@janssen-bouw.nl`

De gebruiker heeft de upload naar werkplaats bevestigd. De kopie van 10 september
2026 om 12:51 is in die map aangetroffen. Alleen die gemelde PDF is op verzoek
hernoemd: de UUID-toevoeging is weggehaald nadat de gewone naam vrij bleek.
Geen bestanden verplaatst, gekopieerd, overschreven of verwijderd; geen
rechten/secrets aangepast.
De gekozen map staat uitsluitend in Power Automate, niet in de SQL/worker.

## Naam van nieuwe kopieën

De naam wordt per upload afgeleid van de bijbehorende bestelling:
`leys - jjmmdd - order <Leys-nummer> - <categorieën>.pdf`.
De besteldatum is `orders.created_at` in `Europe/Amsterdam`, niet de uploaddatum.
Het nummer komt uit het opgeslagen `leys_order_number`. Categorieën komen uit
de orderregels zelf (`order_items.category`), niet uit de later wijzigbare
artikelcatalogus. Iedere categorie staat er eenmaal in, in volgorde van de
eerste orderregel (`id`); de eerste spelling blijft behouden.

Een ontbrekend Leys-nummer wordt `onbekend`; vul het daarom vóór uploaden in.
Zonder ingevulde categorieën wordt de aanduiding `Zonder categorie` gebruikt.
Ongeldige bestandsnaamtekens worden veilig vervangen. Namen worden niet
stilzwijgend afgekapt: past de volledige naam niet binnen 255 UTF-8-bytes,
dan weigert de RPC het koppelen met een specifieke fout. De huidige desktop-app
toont bij iedere koppelingsfout nog haar algemene melding om de bestelling te
verversen. Het bestaande gekoppelde document blijft intact; het al geüploade
nieuwe Storage-object wordt niet automatisch verwijderd.

Power Automate vergelijkt de gewenste naam met de echte bestanden in alleen de
doelmap. De eerste vrije naam wordt gebruikt: gewone naam, daarna `(2)`, `(3)`,
enzovoort tot `(100)`. De vergelijking is niet hoofdlettergevoelig. Een kopie in
een andere map telt niet mee. Ook handmatig geplaatste bestanden tellen wel mee.
Een onvolledige/volle pagina van 5000 namen, 100 bezette kandidaten of een te lange
naam stopt veilig; niets wordt stilzwijgend afgekapt.

De uploadactie gebruikt de bestaande SharePointverbinding met `Files/add`,
`overwrite=false` en retrybeleid `None`. Bij een gelijktijdig ontstaan conflict
faalt de upload veilig in plaats van te overschrijven of blind opnieuw te posten.
De bestaande response `{ok:true,file:'uploaded'}` draait uitsluitend na succes.
De wachtrij bewaart de gewenste naam, niet een eventueel in de map gekozen `(2)`.
Bestaande wachtrijrecords worden niet herschreven.

**Naamgeving gepubliceerd op 10 september 2026.** Voor nieuwe installaties:
publiceer eerst de aangepaste worker en voer daarna alleen
`20260910130000_order_pdf_kopie_naamgeving.sql` uit. Deze voorwaartse migratie
wijzigt geen rechten, authenticatie, bestemming, uploadtrigger of cloudplanning.

**Aanvulling doelmapnamen gepubliceerd op 10 september 2026:** configureer eerst
de flow zoals hierboven, voer daarna uitsluitend de nieuwe migratie
`20260910140000_order_pdf_kopie_doelmapnamen.sql` uit. Die verwijdert globale
naamuniciteit en UUID-suffixlogica. Unieke taak-ID's, tokens en
`(order_id, object_id)`, alle broncontroles en schrijfrechten blijven behouden.
De worker behoeft hiervoor geen nieuwe uitgave.

## Werking

De bestaande bevestigings-RPC blijft de toegangspoort voor uploads. Een trigger
registreert binnen dezelfde transactie een kopieertaak. `pg_net` start de worker
na commit. Een cloudjob controleert elke minuut of een voorbereiding nog moet
beginnen of veilig hervat kan worden. De desktop hoeft daarvoor niet actief te
blijven. Bestaande PDF's worden niet met terugwerkende kracht gekopieerd.

De worker accepteert alleen een taak-ID en een willekeurig taaktoken. De bron,
actor, bestelling en gewenste bestandsnaam komen uit de beschermde registratie.
Het token is uitsluitend een beperkte startbevoegdheid voor die ene reeds
goedgekeurde kopie; de tijdelijke `pg_net`-wachtrij heeft bestaande leesrechten.
Het token is daarom geen algemene serverauthenticatie of geheim voor PDF-toegang.
Het endpoint geeft geen PDF, pad, actor, token of externe URL terug.

De RPC is alleen uitvoerbaar door de serverrol. Alle mutaties gebruiken private
`SECURITY DEFINER`-functies met lege zoekpaden, actieve-lidcontrole en rate limits.
De worker controleert bronpad, maximaal 10 MiB, MIME-type en PDF-header; SQL bindt
het object aan de bestelling, uploader en objectversie. Algemene sleutels worden
nooit naar Microsoft gestuurd. Zowel download als upload volgen geen redirects.

## Uitkomst en herhaling

Voorbereiding mag maximaal drie keer worden geprobeerd. Vlak vóór de externe
POST wordt een eenmalige verzendpoort vastgelegd. Alleen de eerste aanroeper
krijgt toestemming. Na een onzekere POST volgt geen blinde herhaling, omdat de
bestaande Power Automate-stroom geen betrouwbare externe deduplicatie biedt.
`opgeslagen` vereist HTTP 200 en de verwachte expliciete flowbevestiging.
`onbekend` betekent eerst de uitvoeringsgeschiedenis en doelmap controleren.
Een achtergebleven verzendpoging wordt na vijf minuten `onbekend`.

Actieve appleden kunnen veilige kopieerstatussen opvragen via
`binnenapp_order_pdf_kopie_status(p_order_number)`. De huidige clients tonen deze
extra status nog niet. Bestelstatus, Leys-nummer, voorraad en mailstatus worden
door deze functie niet gewijzigd.

## Configuratie en uitgave

**Ingeschakeld op 10 september 2026.** Hoofdmigratie, serverfunctie, goedgekeurd
servergeheim en aanvullende gatewayconfiguratie zijn gepubliceerd. De gebruiker
heeft het instellen van de bestaande publieke projectsleutel expliciet toegestaan.
De JWT-gatewaycontrole staat aan en moet aanblijven; de dispatcher gebruikt de
publieke legacy anon-JWT in de Authorization-header. Die sleutel verleent geen
serverrol- of PDF-toegang. De beperkte taakauthenticatie blijft afzonderlijk vereist.
De activatiemigratie maakt alleen de trigger en de specifieke cloudjob
`binnenapp-order-pdf-kopie` actief. Geen andere planner of appclient gewijzigd.

Alleen servergeheim `ORDER_PDF_POWER_AUTOMATE_URL` bevat de uploadlink. De huidige
Supabase-omgeving levert haar eigen URL en serverrolsleutel. Geen secretwaarde in
deze broncode, configuratie, tests, logs, .exe of mobiele website opnemen.
De worker is vastgezet op de geverifieerde Microsoft-host en runtimeworkflow.

1. Voer de gecontroleerde hoofdmigratie `20260910120000_order_pdf_kopie.sql` uit.
   Die maakt nog geen trigger of cloudjob actief.
2. Sla de goedgekeurde uploadlink als Edge Function-secret op en publiceer
   `copy-order-confirmation` met `verify_jwt = true`. Behoud daarnaast de beperkte
   taakauthenticatie; andere functies blijven ongewijzigd.
3. Voer `20260910120030_order_pdf_kopie_gateway.sql` uit met de goedgekeurde publieke
   legacy anon-JWT in de ene plaatsaanduiding. De bron bevat bewust niet de werkelijke
   sleutel. De helper valideert rol, project, uitgever, algoritme en verval; de
   ingeschakelde gateway controleert de handtekening. Gebruik nooit een
   browseraanmeldtoken of serverrolsleutel voor deze header.
   Controleer weigering van ontbrekende/ongeldige taken en de serverconfiguratie.
4. Activeer uitsluitend na die controles `20260910120100_order_pdf_kopie_activeren.sql`.
5. Controleer één nieuwe echte upload zonder bestaande ordergegevens als
   testfixture te vervangen. Verifieer zowel de kopieregistratie als doelbestand.

Stap 1–4 is uitgevoerd in project `rautxcieowrqifbnxjnx`. Niet opnieuw activeren:
het activatiescript weigert bestaande triggers/planners en een niet-lege wachtrij.
Het vereist ook de ingerichte gatewayhelper vóór het wijzigingen aanbrengt.

## Uitgevoerde controles

- Doelmapnamen: 15 afzonderlijke PGlite-tests en 16 lokale naamkeuzemodeltests
  geslaagd. Power Automate accepteert de configuratie zonder fouten of
  waarschuwingen en meldt na opslaan klaar voor gebruik. SQL-aanvulling is live
  uitgevoerd. Geen echte PDF opnieuw verstuurd als test: binaire REST-upload,
  SharePoint-responseformaat en dubbelnaamgedrag zijn nog niet end-to-end getest.
  De hernoeming van de gemelde bestaande PDF is wel zichtbaar bevestigd.
- Nieuwe naamgeving: 107 workertests, 23 afzonderlijke naamgevingtests en alle
  71 bestaande PostgreSQL-controles geslaagd. De nieuwe migratie is afzonderlijk
  getest met voorbeeldnamen, echte categoriecombinaties van 163/201 bytes,
  Amsterdam-datumgrenzen, nieuwe Leys-waarde tijdens dezelfde upload, behoud van
  oude taken, dubbele namen en rollback bij te lange namen. Geen productie-data
  gebruikt als wijzigbare testfixture. Werkelijke concurrerende sessies zijn
  niet gesimuleerd; de transactie-advisorylock is wel gecontroleerd.
- 70 lokale workertests en 71 geïsoleerde PostgreSQL-tests geslaagd, inclusief
  positieve activering, weigering van ongeldige configuratie en rollback bij
  een mislukte planner. Geen echte orders of PDFs als testfixture gebruikt.
- Live: geldige publieke JWT met lege taak geeft HTTP 400; niet-bestaande
  taak geeft de veilige afwijzing `wachtrij_niet_beschikbaar`; een ongeldige JWT
  wordt al door de gateway geweigerd met HTTP 401. Geen bestand verstuurd.
- Serverrol heeft de noodzakelijke bestaande schema-/functierechten; anon kan
  de werk-RPC en private gatewayhelper niet uitvoeren. Geen algemene grants toegevoegd.
- Live activering bevestigd: uploadtrigger aan, specifieke cloudjob actief en
  eerste automatische uitvoering `succeeded`; wachtrij leeg, dus geen backfill.
- De gebruiker heeft een volledige nieuwe BinnenApp-upload naar de eerdere
  bestemming Mijn Bestanden bevestigd. Read-only
  nacontrole toont de kopie als `opgeslagen` en hetzelfde bestand in de gekozen
  map. Dat bewijst de bestaande kopieerroute, nog niet een nieuwe echte upload
  met de aangepaste leesbare naam.

Bij problemen de specifieke cloudjob en trigger gericht pauzeren/uitschakelen;
geen wachtrij of oude PDF's verwijderen en geen onzekere kopieën opnieuw aanbieden.
Het bewaren van de eerder verspreide uploadlink in servergeheimen maakt eerdere
blootstelling niet ongedaan. Vernieuw die credential door de bevoegde gebruiker
en werk daarna alleen het servergeheim bij; wijzig geen bredere Microsoft-rechten.

Officiële achtergrond: [Supabase-functies plannen](https://supabase.com/docs/guides/functions/schedule-functions)
en [eigen functieauthenticatie](https://supabase.com/docs/guides/functions/auth-headers).
