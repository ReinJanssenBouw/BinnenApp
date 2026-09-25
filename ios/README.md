# BinnenApp voor iPhone en iPad

Dit is de iOS-uitvoering van BinnenApp. De bestaande mobiele BinnenApp draait in WKWebView. Vanuit Locatie opent de ingebouwde ARKit-camera, zonder marker of tweede app. Aanmelden gebeurt in BinnenApp; de native laag ontvangt alleen stelling- en productgegevens, geen wachtwoorden of Supabase-tokens.

## Gebruik

1. Meld je aan, deel producten in bij Locatie en kies een stelling.
2. Tik op **AR-camera** en geef cameratoegang.
3. Scan de omgeving, kies **Plaatsen** en wijs linksonder, rechtsonder en linksboven aan dezelfde voorkant van de stelling aan.
4. Controleer de vakken en kies **Opslaan**. De rijen hebben in deze versie gelijke hoogtes; de aantallen kolommen volgen BinnenApp.
5. Open later dezelfde stelling op dezelfde iPhone en richt op dezelfde omgeving. Na herkenning verschijnen de vakken opnieuw. **Zoek product** laat een vak geel oplichten.

De ruimtekaart staat versleuteld door iOS-bestandsbescherming op dit apparaat, per BinnenApp-gebruiker en stelling. De kaart wordt niet naar Supabase gestuurd en is uitgesloten van back-up. Herinstallatie kan kaarten verwijderen. Gewijzigde rij-/kolomaantallen vereisen opnieuw plaatsen. Producttoewijzingen komen steeds opnieuw uit BinnenApp.

Dit is een eerste implementatie. Belichting, herhaalde stellingpatronen en veranderingen in het magazijn kunnen herkenning verstoren. De software verbergt vakken tijdens beperkte tracking; opnieuw plaatsen blijft mogelijk. De AR-camera wijzigt geen voorraad of producttoewijzingen. Een volledige 3D-magazijneditor en synchronisatie van kaarten tussen apparaten zijn niet inbegrepen.

## Bouwen

Op een Mac met Xcode en XcodeGen: `cd ios && sh prepare.sh && xcodegen generate`, open `BinnenApp.xcodeproj`, kies de eigen Signing Team en een iPhone. Minimum iOS 17. De bundle identifier is `nl.janssenbouw.binnenapp` en moet in het eigen Apple Developer-team beschikbaar zijn.

GitHub Actions **BinnenApp iPhone build** bouwt zonder certificaten, draait geometrie-/payloadtests en maakt een unsigned `.xcarchive`. Dat is een controle-artifact, geen installeerbare IPA. ARKit-tracking vereist een echte iPhone en kan niet in de simulator worden getest.

Voor TestFlight zijn het Apple Developer-team, een App Store Connect-app, distributieondertekening en een geautoriseerde upload nodig. Deze repo bevat geen signingcertificaten of Apple-accountgegevens. De huidige beginschermwebsite verandert niet automatisch in deze iOS-app.

## Bronnen

- https://developer.apple.com/documentation/arkit/saving-and-loading-world-data
- https://developer.apple.com/documentation/webkit/wkscriptmessagehandlerwithreply
- https://developer.apple.com/documentation/arkit/arscnview/raycastquery(from:allowing:alignment:)
