# Bourse · Filtre PEA

Application locale en Python et Flask pour repérer les actions qui franchissent leur moyenne mobile simple à 50 ou 100 séances lors de la dernière clôture. L’interface HTML est rendue par Python. Elle fonctionne avec JavaScript désactivé.

## Démarrer

Installer Python 3.10 ou plus récent. Sous macOS ou Linux, ouvrir un terminal et lancer les commandes suivantes.

```sh
git clone https://github.com/sebastien-grdn/bourse.git
cd bourse
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python app.py
```

Ouvrir [le filtre local](http://127.0.0.1:8792/). Sous macOS, un double-clic sur **Lancer le filtre PEA.command** prépare aussi l’environnement et ouvre le navigateur. Sous Windows, utiliser `py -m venv .venv` puis `.venv\Scripts\python.exe` pour l’installation des dépendances et le démarrage.

## Utilisation

Le premier écran contient un relevé daté du 20 novembre 2026 sur les 40 entreprises du CAC 40. **Actualiser les cours** récupère un an de cours journaliers auprès de Yahoo Finance. **Modifier la liste** permet de saisir les tickers fournis par son courtier. Les places prises en charge sont Paris, Amsterdam, Bruxelles et Lisbonne. La dernière analyse est conservée dans le dossier local `.cache`.

Un signal exige que la clôture précédente soit inférieure ou égale à la moyenne mobile de cette séance, puis que la dernière clôture soit strictement supérieure à sa propre moyenne. Les deux critères sont indépendants. Le calcul exige 101 clôtures consécutives et utilise les prix avant arrondi, hors réinvestissement des dividendes. Le graphique retrace 30 jours calendaires.

La séance ordinaire est prise en compte à partir de 18 h, heure de Paris. Les dates sont comparées aux séances du CAC 40 et les données manquantes sont signalées. La liste de test correspond à la composition de novembre 2026. L’éligibilité au PEA d’une liste personnelle dépend des titres fournis par le courtier.


## Rechercher un franchissement depuis X séances

Choisir de 1 à 100 séances. La dernière clôture compte pour 1, la précédente pour 2. Le mode « Dans les X dernières séances » retient le franchissement le plus récent de chaque moyenne si le cours est resté strictement au-dessus à toutes les clôtures suivantes. Le mode exact exige que ce franchissement se situe à la Xᵉ séance en remontant. Une égalité avec la moyenne interrompt la série. Chaque résultat indique la moyenne et la date du signal. Si les données ne permettent pas de vérifier toute la fenêtre, l’interface le signale.
