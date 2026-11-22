# Bourse · Filtre PEA

Application locale pour repérer les actions qui franchissent à la hausse leur moyenne mobile simple à 50 ou 100 séances. Le CAC 40 sert de liste de départ. Le bouton **Modifier la liste** permet d’utiliser les tickers éligibles au PEA fournis par son courtier.

## Démarrage

Avec Node.js 22.13 ou plus récent et npm, exécuter les commandes suivantes depuis la racine du dépôt.

```sh
node -e "require('node:fs').copyFileSync('.openai/hosting.example.json', '.openai/hosting.json', require('node:fs').constants.COPYFILE_EXCL)"
npm ci
npm run build
npm start -- --port 8792
```

La première commande initialise la configuration une seule fois. Ouvrir ensuite [le filtre sur cet ordinateur](http://127.0.0.1:8792/). Sur Mac, après la première compilation, le fichier **Lancer le filtre PEA.command** permet de relancer l’application.

## Lecture des résultats

Le filtre compare les deux dernières séances clôturées. Un signal exige que le cours précédent soit inférieur ou égal à sa moyenne mobile du jour et que la dernière clôture dépasse strictement sa nouvelle moyenne mobile. Le graphique affiche 30 jours calendaires.

Le relevé initial du CAC 40 est daté du 20 novembre 2026. **Actualiser les cours** télécharge les clôtures journalières depuis Yahoo Finance. Chaque analyse exige 101 clôtures consécutives. Le détail de chaque signal présente les deux cours et les deux moyennes qui permettent de vérifier le calcul.
