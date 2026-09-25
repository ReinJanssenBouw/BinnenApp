# Locatie in 3D (Windows 1.0.12)

De ruimte heeft een vaste vloermaat van **6630 × 4820 mm**. Het model opent met de hele ruimte; met **Stelling bekijken** kun je een stelling van dichtbij bewerken. Stellingposities worden in centimeters gemeten vanaf het midden van de ruimte. Een waarschuwing verschijnt als een stelling, inclusief de ingestelde draaihoek, over de vloergrens steekt. Er is nog geen wandhoogte ingesteld.

Open **Locatie**. Maak links een stelling en vul rechts breedte, hoogte en diepte in centimeters in. Onder **Rijen en productkolommen** kun je per rij het aantal vakken kiezen. Via **Positie in het magazijn** plaats en draai je stellingen ten opzichte van elkaar; **Ruimte bekijken** toont het geheel.

Sla het model op en klik op een vak om een bestaand product toe te voegen. Klik daarna op het product om de breedte, hoogte en diepte van het product of de verpakking in te stellen. Elk artikel wordt als één blok getoond, onafhankelijk van de voorraad. Een waarschuwing geeft aan wanneer de gekozen maten niet passen. De startmaten zijn voorbeelden, geen opgemeten afmetingen.

Sleep om te draaien, scroll om te zoomen en sleep met de rechtermuisknop om te verschuiven. De knoppen Voorkant, Bovenkant en Alles in beeld helpen bij het navigeren. De bestaande Vakkenlijst blijft beschikbaar. Alleen beheerders kunnen wijzigingen opslaan.

## Opslag en uitrol

Stellingen, rijen, kolommen en productkoppelingen gebruiken de bestaande BinnenApp-RPC's. Voorraadvelden worden niet gewijzigd.

De extra 3D-maten worden in deze release lokaal bewaard in `binnenapp-location-scene-v1.json` in de Electron-gebruikersdatamap. Dit bestand blijft behouden bij appupdates. Op een andere pc zijn deze maten nog niet beschikbaar. Lokale opslag wordt alleen gebruikt wanneer de nieuwe scene-RPC ontbreekt (PGRST202); netwerkfouten of toegangsweigeringen worden niet als een ontbrekende RPC behandeld.

Cloudmigratie `supabase/migrations/20260925140000_locatie_3d.sql` is voorbereid, maar op 25 september 2026 **niet uitgevoerd**: de browserbediening voor het Supabase-dashboard was onbereikbaar. Alleen toepassen op BinnenApp-project **guurncfxhcxwvgnzoeyp**. Daarna `scripts/controle-locaties-3d.sql` uitvoeren; deze test draait alle wijzigingen terug. De losse tabel voorkomt dat oudere clients de maten overschrijven. Na activering verschijnen bestaande lokale maten als klaar om te delen; **Model opslaan** zet ze in de cloud.

Gecontroleerd met `node scripts/controle-locatie-opslag.cjs` en de geïsoleerde Electron-fixture `scripts/controle-locaties-3d.cjs`: aanmaken, maten, rijindeling, producttoewijzing/verplaatsing, herladen, ongeldige invoer, revisieconflicten, beheerrechten, voorraadbehoud, WebGL en desktopbreedtes. De cloudmigratie en rollback-SQL-test moeten nog op de database worden uitgevoerd.
