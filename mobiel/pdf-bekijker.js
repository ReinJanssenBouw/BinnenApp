/* Gedeelde PDF-lezer voor BinnenApp. Documenten blijven lokaal in het geheugen. */
(() => {
  'use strict';
  const basis = new URL('./vendor/pdfjs/', document.currentScript.src);
  const MAX_BYTES = 10 * 1024 * 1024;
  let bibliotheek, actief = null;

  function element(naam, klasse, tekst) {
    const el = document.createElement(naam);
    if (klasse) el.className = klasse;
    if (tekst !== undefined) el.textContent = tekst;
    return el;
  }
  function knop(tekst, label, actie) {
    const el = element('button', 'bpv-knop', tekst);
    el.type = 'button'; el.title = label; el.setAttribute('aria-label', label);
    el.addEventListener('click', actie);
    return el;
  }
  function uitleg(fout) {
    if (fout?.name === 'PasswordException') return 'Deze PDF is beveiligd met een wachtwoord. Voeg een ontgrendelde kopie toe om hem hier te bekijken.';
    if (fout?.name === 'InvalidPDFException') return 'Dit bestand is geen leesbare PDF. Voeg de originele orderbevestiging opnieuw toe.';
    if (fout?.name === 'MissingPDFException') return 'De PDF is niet meer beschikbaar. Voeg de orderbevestiging opnieuw toe.';
    if (fout instanceof TypeError) return 'De PDF kon niet worden geladen. Controleer je verbinding en probeer opnieuw. Gebruik bij een oudere iPhone de nieuwste beschikbare iOS-versie.';
    return fout?.message || 'De PDF kon niet worden geopend. Probeer opnieuw.';
  }
  async function pdfBibliotheek() {
    if (!bibliotheek) {
      bibliotheek = import(new URL('pdf.min.mjs', basis).href).then(lib => {
        lib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', basis).href;
        return lib;
      }).catch(fout => { bibliotheek = null; throw fout; });
    }
    return bibliotheek;
  }

  class PdfBekijker {
    constructor(opties) {
      this.opties = opties; this.gesloten = false; this.generatie = 0;
      this.pagina = 1; this.zoom = 1; this.wachtrij = Promise.resolve();
      this.vorigeFocus = document.activeElement;
      this.dialoog = element('dialog', 'bpv-dialoog');
      this.dialoog.setAttribute('aria-labelledby', 'bpv-titel');
      this.dialoog.setAttribute('aria-describedby', 'bpv-bestand');
      const kop = element('header', 'bpv-kop');
      kop.append(element('span', 'bpv-document', 'PDF'));
      const titels = element('div', 'bpv-titels');
      const titel = element('h2', '', opties.titel || 'Orderbevestiging');
      titel.id = 'bpv-titel';
      this.bestand = element('p', '', opties.bestandsnaam || opties.bestelnummer || 'PDF bekijken');
      this.bestand.id = 'bpv-bestand';
      titels.append(titel, this.bestand); kop.append(titels);
      this.sluitKnop = knop('×', 'PDF sluiten', () => this.sluiten());
      this.sluitKnop.classList.add('bpv-sluiten'); kop.append(this.sluitKnop);
      this.balk = element('div', 'bpv-balk'); this.balk.setAttribute('aria-label', 'PDF-bediening');
      const bladeren = element('div', 'bpv-groep');
      this.vorige = knop('‹', 'Vorige pagina', () => this.blader(-1));
      this.teller = element('span', 'bpv-teller', 'Pagina —');
      this.teller.setAttribute('aria-live', 'polite');
      this.volgende = knop('›', 'Volgende pagina', () => this.blader(1));
      bladeren.append(this.vorige, this.teller, this.volgende);
      const vergroten = element('div', 'bpv-groep');
      this.kleiner = knop('−', 'Uitzoomen', () => this.vergroot(-.25));
      this.passend = knop('Passend', 'Aanpassen aan breedte', () => { this.zoom = 1; this.aanvragen(); });
      this.passend.classList.add('bpv-passend');
      this.groter = knop('+', 'Inzoomen', () => this.vergroot(.25));
      vergroten.append(this.kleiner, this.passend, this.groter);
      this.bewaren = knop('Opslaan', 'PDF opslaan', () => this.opslaan());
      this.bewaren.classList.add('bpv-bewaren');
      this.balk.append(bladeren, vergroten, this.bewaren);
      this.gebied = element('div', 'bpv-gebied'); this.gebied.tabIndex = 0;
      this.gebied.setAttribute('aria-label', 'Documentpagina; bij inzoomen kun je scrollen');
      this.melding = element('div', 'bpv-melding');
      this.meldingTekst = element('p', '', 'PDF laden…');
      this.meldingTekst.setAttribute('role', 'status');
      this.opnieuw = knop('Opnieuw proberen', 'PDF opnieuw laden', () => this.laden());
      this.opnieuw.hidden = true;
      this.melding.append(this.meldingTekst, this.opnieuw);
      this.papier = element('div', 'bpv-papier');
      this.canvas = element('canvas', 'bpv-canvas'); this.canvas.setAttribute('aria-hidden', 'true');
      this.tekst = element('p', 'bpv-voorlezen'); this.tekst.setAttribute('aria-label', 'Tekst van de huidige PDF-pagina');
      this.papier.append(this.canvas, this.tekst); this.papier.hidden = true;
      this.gebied.append(this.melding, this.papier);
      const voet = element('footer', 'bpv-voet');
      voet.append(element('span', '', opties.bestelnummer || 'BinnenApp'));
      this.schaal = element('span', '', 'Alleen bekijken'); voet.append(this.schaal);
      this.dialoog.append(kop, this.balk, this.gebied, voet);
      this.dialoog.addEventListener('cancel', event => { event.preventDefault(); this.sluiten(); });
      this.dialoog.addEventListener('close', () => this.sluiten());
      this.dialoog.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.target.matches('input,textarea') || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === 'PageDown') { event.preventDefault(); this.blader(1); }
        if (event.key === 'PageUp') { event.preventDefault(); this.blader(-1); }
      });
      document.body.append(this.dialoog);
      this.dialoog.showModal(); this.sluitKnop.focus();
      this.bediening();
      this.breedte = this.gebied.clientWidth;
      this.formaat = new ResizeObserver(() => {
        const breedte = this.gebied.clientWidth;
        if (Math.abs(this.breedte - breedte) < 2) return;
        this.breedte = breedte; clearTimeout(this.formaatTimer);
        this.formaatTimer = setTimeout(() => this.aanvragen(), 100);
      });
      this.formaat.observe(this.gebied);
    }
    bediening() {
      const klaar = Boolean(this.document) && !this.gesloten;
      this.vorige.disabled = !klaar || this.pagina <= 1;
      this.volgende.disabled = !klaar || this.pagina >= this.document.numPages;
      this.kleiner.disabled = !klaar || this.zoom <= .75;
      this.groter.disabled = !klaar || this.zoom >= 3;
      this.passend.disabled = !klaar; this.bewaren.disabled = !klaar;
      this.passend.textContent = this.zoom === 1 ? 'Passend' : Math.round(this.zoom * 100) + '%';
      this.teller.textContent = klaar ? 'Pagina ' + this.pagina + ' / ' + this.document.numPages : 'Pagina —';
    }
    bericht(tekst, fout = false) {
      this.melding.hidden = false; this.meldingTekst.textContent = tekst;
      this.melding.classList.toggle('bpv-fout', fout); this.opnieuw.hidden = !fout;
      this.papier.hidden = true;
    }
    async laden() {
      const generatie = ++this.generatie;
      this.bezig?.cancel();
      const oud = this.laadtaak; this.laadtaak = null; this.document = null;
      if (oud) await oud.destroy().catch(() => {});
      if (this.gesloten || generatie !== this.generatie) return;
      this.pagina = 1; this.zoom = 1; this.bediening(); this.bericht('PDF laden…');
      if (this.downloadUrl) { URL.revokeObjectURL(this.downloadUrl); this.downloadUrl = null; }
      try {
        const [lib, bestand] = await Promise.all([pdfBibliotheek(), this.opties.laden()]);
        if (this.gesloten || generatie !== this.generatie) return;
        const bytes = bestand?.bytes instanceof Uint8Array ? bestand.bytes : new Uint8Array(bestand?.bytes || []);
        if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('De PDF is leeg of groter dan 10 MB. Voeg een kleinere PDF toe.');
        const begin = new TextDecoder('ascii').decode(bytes.subarray(0, 1024));
        if (!begin.includes('%PDF-')) throw new Error('Dit bestand is geen PDF. Voeg de originele orderbevestiging opnieuw toe.');
        this.naam = String(bestand.naam || this.opties.bestandsnaam || 'Orderbevestiging.pdf');
        this.bestand.textContent = this.naam;
        this.downloadUrl = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
        // Geen PDF-scripts, formulieren of externe documentlinks uitvoeren.
        this.laadtaak = lib.getDocument({
          data: bytes, isEvalSupported: false, enableXfa: false,
          cMapUrl: new URL('cmaps/', basis).href, cMapPacked: true,
          standardFontDataUrl: new URL('standard_fonts/', basis).href,
          wasmUrl: new URL('wasm/', basis).href,
          iccUrl: new URL('iccs/', basis).href,
          useSystemFonts: true
        });
        const document = await this.laadtaak.promise;
        if (this.gesloten || generatie !== this.generatie) return;
        this.document = document;
        this.aanvragen();
      } catch (fout) {
        if (!this.gesloten && generatie === this.generatie) {
          this.document = null; this.bediening(); this.bericht(uitleg(fout), true);
        }
      }
    }
    blader(richting) {
      if (!this.document) return;
      const pagina = Math.max(1, Math.min(this.document.numPages, this.pagina + richting));
      if (pagina === this.pagina) return;
      this.pagina = pagina; this.gebied.scrollTop = 0; this.gebied.scrollLeft = 0; this.aanvragen();
    }
    vergroot(stap) {
      if (!this.document) return;
      this.zoom = Math.max(.75, Math.min(3, this.zoom + stap)); this.aanvragen();
    }
    aanvragen() {
      if (!this.document || this.gesloten) return;
      const generatie = ++this.generatie;
      this.bediening(); this.bezig?.cancel();
      this.wachtrij = this.wachtrij.catch(() => {}).then(() => this.teken(generatie));
    }
    async teken(generatie) {
      if (this.gesloten || generatie !== this.generatie || !this.document) return;
      try {
        this.gebied.setAttribute('aria-busy', 'true');
        const pagina = await this.document.getPage(this.pagina);
        if (this.gesloten || generatie !== this.generatie) return;
        const origineel = pagina.getViewport({scale: 1});
        const ruimte = Math.max(180, this.gebied.clientWidth - 32);
        const schaal = Math.min(ruimte / origineel.width, 1.6) * this.zoom;
        const beeld = pagina.getViewport({scale: schaal});
        // Eén pagina tegelijk, met een begrensd canvas voor telefoons en CPU-weergave.
        const scherpte = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6000000 / (beeld.width * beeld.height)));
        this.canvas.width = Math.floor(beeld.width * scherpte);
        this.canvas.height = Math.floor(beeld.height * scherpte);
        this.canvas.style.width = Math.floor(beeld.width) + 'px';
        this.canvas.style.height = Math.floor(beeld.height) + 'px';
        this.bezig = pagina.render({
          canvasContext: this.canvas.getContext('2d'), viewport: beeld,
          transform: scherpte !== 1 ? [scherpte, 0, 0, scherpte, 0, 0] : null,
          background: '#ffffff'
        });
        await this.bezig.promise;
        if (this.gesloten || generatie !== this.generatie) return;
        this.melding.hidden = true; this.papier.hidden = false;
        this.schaal.textContent = this.zoom === 1 ? 'Passend op je scherm' : 'Vergroot · scroll om alles te zien';
        this.gebied.setAttribute('aria-busy', 'false');
        try {
          const inhoud = await pagina.getTextContent();
          if (this.gesloten || generatie !== this.generatie) return;
          this.tekst.textContent = inhoud.items.map(item => item.str || '').join(' ');
        } catch {
          // Een ontbrekende tekstlaag mag een goed getekende pagina niet verbergen.
          if (!this.gesloten && generatie === this.generatie) this.tekst.textContent = 'Deze pagina bevat geen uitleesbare tekst.';
        }
      } catch (fout) {
        if (this.gesloten || generatie !== this.generatie || fout?.name === 'RenderingCancelledException') return;
        this.gebied.setAttribute('aria-busy', 'false');
        this.bericht('Deze pagina kon niet worden getoond. ' + uitleg(fout), true);
      }
    }
    opslaan() {
      if (!this.downloadUrl || !this.document) return;
      const link = element('a');
      link.href = this.downloadUrl; link.download = this.naam.replace(/[\\/:*?"<>|]/g, '-');
      document.body.append(link); link.click(); link.remove();
    }
    sluiten() {
      if (this.gesloten) return;
      this.gesloten = true; ++this.generatie;
      this.formaat?.disconnect(); clearTimeout(this.formaatTimer);
      this.bezig?.cancel(); this.laadtaak?.destroy().catch(() => {});
      this.document = null;
      if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
      this.canvas.width = 0; this.canvas.height = 0;
      if (this.dialoog.open) this.dialoog.close();
      this.dialoog.remove();
      if (actief === this) actief = null;
      if (this.vorigeFocus?.isConnected) this.vorigeFocus.focus({preventScroll: true});
    }
  }
  window.BinnenPdf = Object.freeze({
    open(opties) {
      actief?.sluiten();
      if (typeof opties?.laden !== 'function') throw new Error('De PDF-ophaalroute ontbreekt.');
      actief = new PdfBekijker(opties);
      return actief.laden();
    },
    sluiten() { actief?.sluiten(); }
  });
})();
