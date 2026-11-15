# Spilletid

Enkel webapp for trenere i barnefotball: rettferdig bytteplan og lik spilletid,
med stor nedtelling, lyd og skjerm-våkenlås under kamp.

Ingen byggesteg og ingen avhengigheter:

| Fil | Hva |
|---|---|
| `index.html` | Hele appen (UI). |
| `engine.js` | Byttelogikken – ren JS uten DOM/klokke, gjenbrukes i en senere native-app. |
| `test/engine.test.js` | Enhetstester for motoren. |

## Funksjoner
- **To modus:** *Automatisk* (appen varsler 20 sek før og bytter etter plan – for de minste)
  og *Manuell* (treneren bytter når det passer, appen foreslår hvem).
- **Rettferdig rotasjon basert på faktisk spilletid:** den med mest tid går ut, den med minst kommer inn.
  Forslagene regnes fra ekte minutter, så manuelle bytter, skader og pauser justerer køen automatisk.
- **Manuelle bytter:** trykk en spiller og så en på andre siden – eller sveip en spiller til siden
  for å bytte med forslaget.
- **Skade:** marker en spiller som skadet; neste på benken kommer inn, og spilletida stopper.
  «Tilbake» setter spilleren inn i rotasjonen igjen.
- **Carry-over:** spilletid tas med mellom kampene i samme økt/cup, så dagen jevner seg ut.
- **Tåler reload:** kampen lagres fortløpende og fortsetter hvis siden lastes på nytt.
- Keeper låses utenfor rotasjonen, med varsel om hvem som sto sist.
- All data lagres lokalt i nettleseren (`localStorage`).

## Kjøre lokalt
Åpne `index.html`, eller server mappa:

```bash
python3 -m http.server 8000
```

## Tester

```bash
node test/engine.test.js
```

Sjekker blant annet at alle får lik spilletid innenfor én byttperiode i 720 kombinasjoner av
tropp, format, kamplengde og byttintervall.

## Deploy
Statisk side – publish directory er repo-roten, ingen build command.
