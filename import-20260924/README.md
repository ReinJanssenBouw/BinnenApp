# Goedgekeurde productimport 24 september 2026

36 door de gebruiker opgegeven Polvo-links, expliciet goedgekeurd met 'ja'. Alleen BinnenApp (`guurncfxhcxwvgnzoeyp`).

`import.json` bevat de gecontroleerde productnamen, bronlinks, originele afbeeldingen, categorieën en besteleenheden. `browser-gegevens.tsv` bevat gegevens van pagina's die pas na JavaScript-rendering beschikbaar waren. Verpakkingswaarde 0 op de bronpagina wordt niet als geldig bestelaantal gebruikt: zulke artikelen worden per stuk of per in de titel genoemde verpakking aangeboden. De verfrol is per set van 2; poetspapier per pak van 6 rollen; nagels per pak van 5 kg. Positieve aantallen uit 'verpakt per' worden gebruikt als bestelstap.

Er zijn geen openbare prijzen getoond. Prijs, voorraad en minimumvoorraad starten op 0; prijs 0 is een tijdelijke ontbrekende prijs, geen gratis product. Magazijnpositie en locatie blijven leeg.

`vierkant.ps1` voegt uitsluitend wit canvas toe en kopieert originele pixels zonder schalen of bijsnijden. `afbeelding-controle.json` legt de controle vast. De vierkante PNG's staan in `mobiel/product-images` en worden via het afzonderlijke BinnenApp Vercel-project gepubliceerd.

`import.sql` vergrendelt de producttabel tijdens nummering, behoudt bestaande producten en vermijdt duplicaten op Polvo-artikelnummer. JB-codes volgen het hoogste bestaande nummer, minimaal vier cijfers. De app gebruikt historisch het veld `ean_code` voor het Polvo-artikelnummer; dit is niet de fabrikant-EAN.
