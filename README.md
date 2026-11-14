# Spilletid

Enkel webapp for trenere i barnefotball: rettferdig bytteplan og lik spilletid,
med stor nedtelling, lyd og skjerm-våkenlås under kamp.

MVP-en er én selvstendig fil – [`index.html`](index.html), vanilla JS, ingen byggesteg.
Åpne filen i en nettleser, eller deploy mappa som statisk side (f.eks. Netlify).

## Funksjoner
- Oppsett: format (3-er–11-er), kamplengde, oppmøtesjekk, valgfri keeper med historikk-varsel.
- Forhåndsberegnet rotasjon (minst spilletid inn / mest ut) med carry-over mellom kamper i samme økt.
- Kampskjerm: nedtelling til bytte, INN/UT, benk-kø, pause, lyd + vibrasjon, skjerm-våkenlås.
- All data lagres lokalt i nettleseren (`localStorage`).

## Kjøre lokalt
Ingen avhengigheter. Åpne `index.html`, eller server mappa:

```bash
python3 -m http.server 8000
```

## Deploy
Statisk side – publish directory er repo-roten, ingen build command.
