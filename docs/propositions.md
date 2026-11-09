# Propositions d'avancement

Synthèse de tout ce qui a été proposé pour le prototype, à partir des retours d'usage et des exigences
habituelles d'un outil d'identification de biens culturels (fiabilité mesurée, traçabilité, passage à
l'échelle, robustesse sur le terrain). Chaque ligne dit ce que ça
apporte, ce que ça coûte, et si c'est mesurable avec `npm run evaluate`.

Ordre de réalisation choisi : **1 → 2** (ce document, puis le code), ensuite 3, 5, 6, le remote adapter,
et les exigences transverses.

## État

| # | Brique | État |
|---|---|---|
| 0 | Jeu d'évaluation (39 vues alternatives) et `scripts/evaluate.mjs` : recall@k, MRR, CLIP vs DINOv2 | **fait** |
| 0 | Index `items.json` réaligné sur les vignettes JPEG stockées (écart médian 0,019 corrigé) | **fait** |
| 1 | Affinage par métrique : projection apprise sur embeddings gelés, 400 paires du Met | **fait** — recall inchangé (bruit), marge +63 %, ensembles conformes ×4 plus petits |
| 2 | Prédiction conforme + rejet hors-base | **fait** — couverture ≈ garantie, 5,5 candidats à 95 % ; rejet « inconnu » ≈ 30 % à 10 % de faux rejets : limite mesurée |
| 3 | Ré-ordonnancement par patches DINO (fragments) | **fait** — MaxSim : +10 points de recall@1 sur fragments à 50 % (deux tiers de la perte récupérés) ; voisins mutuels inutiles ; SuperGlobal et MASt3R restent à faire |
| 2b | Seuils conformes dans l'application (`schema.similarity.calibration`, `reading.ts`, panneau et page Contrôle) | **fait** — τ CLIP = 0,747 à α = 0,1 (400 paires), à 0,003 du seuil manuel ; 5 tests |
| 4 | DBA / diffusion hors ligne sur l'index | à faire |
| 5 | SigLIP 2 ou Perception Encoder pour catégorie / pays, à la place de CLIP B/32 | à faire |
| 6 | Augmentations terrain + TTA + évaluation par condition | **mesure par condition faite** (`scripts/robustness.mjs`, README § 16) ; augmentation à l'entraînement et TTA non faits, la prise de vue guidée est le meilleur levier d'après la mesure |
| 7 | Recherche filtrée par métadonnées prédites | à faire (côté index) |
| 8 | Inférence sur le poste, index sur le serveur : `remoteAdapter` + service HNSW | **fait** — `service/main.py` (FastAPI + hnswlib, recherche filtrée, facettes, archive SHA-256 vérifié), `remoteAdapter.ts`, banc : ×8,8 à 100 000 vecteurs, recall 99,4 % |

---

## 1. Affinage par métrique (le plus gros gain attendu)

**Pourquoi.** Le *Met Dataset* (NeurIPS 2021) montre, sur 224 000 œuvres du Met avec photos de studio à
l'entraînement et photos de visiteurs au test, que l'apprentissage de métrique (ArcFace, contrastif) suivi
d'un classifieur kNN double le score d'un classifieur standard. C'est exactement le glissement
studio → terrain d'un comptoir de douane.

**Ce qu'on fait ici, sans GPU.** On n'entraîne pas le backbone. On apprend une matrice de projection
W (d × d, initialisée à l'identité) sur les embeddings gelés de DINOv2, avec une perte contrastive
InfoNCE : chaque paire (photo principale, vue alternative) d'un même objet doit se rapprocher, les
autres objets du lot servent de négatifs. Quelques centaines d'objets suffisent à mesurer un effet.

- `scripts/build-pairs.mjs` : collecte des objets du Met (domaine public) avec au moins une vue
  alternative, embarque principale + vue, écrit `eval/pairs/<modèle>.json` (vecteurs seulement, pas d'images).
  Les 64 objets du corpus de démo sont **exclus** de l'entraînement : ils restent le jeu de test.
- `scripts/train-head.mjs` : apprend W, écrit `eval/heads/<modèle>.json`.
- `scripts/evaluate.mjs --head eval/heads/<modèle>.json` : applique W au corpus et aux requêtes et
  remesure recall@k. Le gain se lit avant/après sur le même tableau.

**Étape suivante (avec GPU et données terrain).** Affiner le backbone lui-même (ArcFace ou SupCon) sur
des paires studio / photos de terrain, et exporter en ONNX int8 pour le navigateur.

## 2. Prédiction conforme et rejet hors-base

**Pourquoi.** Un cosinus de 0,78 n'est pas une probabilité, et les seuils de `schema.similarity`
(0,75 / 0,8) sont propres à CLIP. La prédiction conforme (RCIR, AAAI 2025) donne, pour chaque
requête, un **ensemble de candidats de taille adaptative** qui contient le bon objet avec une probabilité
garantie 1 − α, sans réentraînement et pour n'importe quel encodeur. Quand l'ensemble explose, c'est
le signal « objet absent de la base ». C'est une IA dont on peut dire ce qu'elle garantit, et la
traçabilité du doute pour l'agent.

**Ce qu'on fait.** `scripts/calibrate.mjs` :

1. corpus = photos principales d'un jeu d'objets, requêtes = leurs vues alternatives ;
2. une moitié des objets sert de **calibration** : on relève la similarité du bon objet pour chaque requête,
   τ_α = quantile d'ordre α de ces scores ;
3. l'autre moitié sert de **test** : l'ensemble conforme d'une requête = tous les objets de similarité ≥ τ_α ;
   on mesure la couverture empirique (doit être ≥ 1 − α) et la taille moyenne de l'ensemble ;
4. **rejet** : un troisième lot d'objets est retiré du corpus ; leurs vues deviennent des requêtes
   « hors base ». Règle : ensemble vide → « inconnu ». On mesure le taux de rejet correct et les faux rejets.

Sortie : `eval/calibration-<modèle>.json` avec τ pour α ∈ {0,05 ; 0,1 ; 0,2}, à brancher ensuite
dans `reading.ts` à la place des seuils fixes.

**Résultats (4 nov. 2026, DINOv2-small, corpus 107, calibration 67, test 40 + 39 hors base).** Couverture
92,5 % pour 95 % garanti (effet d'échantillon) ; taille moyenne de l'ensemble 23,2 brut → 5,5 avec la tête
apprise. Rejet hors base : règle absolue et règle de marge donnent toutes deux ≈ 30 % de rejets corrects à
10 % de faux rejets. Conclusion : la similarité globale ne suffit pas à dire « inconnu » ; il faut une
vérification locale du top-1 (brique 3) ou un modèle plus fort. Détail dans le README, § 16.

## 3. Ré-ordonnancement

- **SuperGlobal** (ICCV 2023) : raffiner les vecteurs globaux de la requête et des top-k entre eux ;
  +7 points sur ROxford+1M Hard, quasi gratuit derrière un index.
- **Patches DINO** : plus proches voisins mutuels entre les 256 jetons de patch de la requête et ceux de
  chaque candidat ; retrouve un objet depuis un fragment ou un détail ; donne une carte des zones qui
  correspondent, lisible par un expert.
- **MASt3R / RoMa v2** pour les cas durs, sur quelques dizaines de candidats seulement.
- Mesure : crops à 25 % et 50 % des vues alternatives, recall global qui chute, recall ré-ordonné qui remonte.

**Résultats (4 nov. 2026, DINOv2-small, top-20).** Image entière : aucun effet. Fragment à 70 % du côté :
global 66,7 % → MaxSim 74,4 %. Fragment à 50 % : global 59,0 % → MaxSim 69,2 % (MRR 0,713 → 0,791). Le
comptage de voisins mutuels est inutile (56,4 %). Coût 700 ms / requête en JS naïf. Suite : vérification
géométrique des correspondances (RANSAC) pour durcir le rejet « inconnu », SuperGlobal pour le ré-ordonnancement
global bon marché, MASt3R pour les cas les plus durs. Détail dans le README, § 16.

## 4. Expansion de requête et diffusion

α-QE à la requête ; DBA hors ligne sur toute la base (le même calcul, une fois à l'indexation) ;
diffusion sur graphe kNN (f = (I − αS)⁻¹ y). +2 à +4 points attendus. À coupler à une vérification pour
éviter la dérive de sujet.

## 5. Encodeur pour l'identification

Remplacer CLIP ViT-B/32 par SigLIP 2 ou Perception Encoder pour la question « quel type, quel pays »,
avec des prompts par catégorie du 19 CFR §12.104g. Mesure : `category@1`, `origin@1`.
Garder DINOv3 pour l'appariement d'instance (choix de l'équipe, confirmé par nos mesures).

## 6. Robustesse terrain

Générer flou, sous-exposition, reflets, rotation, fond encombré, cadrage partiel à partir des vues
alternatives ; mesurer la chute de recall par condition et par modèle ; montrer la parade (plusieurs
variantes de la requête moyennées — `averageNormalized` existe déjà). C'est un test de terrain simulé,
en miniature.

## 7. Recherche filtrée

Préfiltrer l'ANN par catégorie / pays prédits (Milvus le supporte) : moins de candidats, plus de précision.

## 8. Architecture : inférence sur le poste, index sur le serveur

Le navigateur calcule le vecteur (28–104 ms mesurés en int8), le serveur ne fait que l'ANN. 1,5 Ko
transitent au lieu d'une image ; l'image ne quitte jamais l'appareil. `remoteAdapter.ts` qui implémente
`CollectionAdapter`, `VITE_ADAPTER=remote`, un service FastAPI + hnswlib pour la démonstration.
Section README « Passage à l'échelle » (HNSW, DiskANN, Milvus).

---

## Exigences transverses

- **Traçabilité du dossier** : le JSON exporté porte le modèle et sa révision, la base interrogée
  (`adapter.info()` : modèle, dimension, taille, date, moteur), les seuils en vigueur (τ, α, source), le meilleur
  score, la fiabilité, l'ensemble conforme et les scores de chaque candidat. — **fait** (9 novembre 2026)
- **Couverture de test ≥ 90 %** : 41,5 % aujourd'hui sur `src/lib` ; tests de composants Svelte, seuil en
  CI, `npm audit --omit=dev` en CI.
- **Bouchons** : `getFacets()` et `archiveImage` implémentés dans le remote adapter, avec vérification
  SHA-256 côté serveur. — **fait** (service/main.py : facettes réelles, archive refusée en 409 si l'empreinte diffère).
- **Origines** : pays enregistré par le musée (`origin_basis: recorded`), sinon déduit et marqué
  (`inferred`), sinon vide ; `byzantine → TR` et `tibet → CN` supprimés. 22 enregistrées, 32 déduites, 10 vides ;
  `--metadata-only` refait les règles sans toucher aux vignettes ni aux vecteurs. — **fait** (9 novembre 2026)
- **Découpler `items.json`** : métadonnées d'un côté, embeddings de l'autre ; en mode remote le client
  n'a plus besoin des vecteurs.
- **Interface `Embedder`** : `{ id, dim, embed(blob) }` dans `embedder.ts`, DINOv2 dans le navigateur,
  refus de requête si `dataset.model ≠ embedder.id`.
- **Licence** : DINOv3 est sous licence Meta sur mesure (commercial permis, mention « Built with DINOv3 »,
  exclusions ITAR / militaire) ; à vérifier avant toute utilisation par une administration.

## Consolidation (4 novembre 2026)

Une relecture du dépôt a pointé des formulations trop affirmatives et des limites non dites.
Traité :

- **Formulations de confiance** : « garanti à 90 % » → « couverture visée de 90 % sur le jeu de calibration,
  non vérifiée en conditions réelles » ; « objet probablement absent » → « résultat non concluant ». — fait
- **Ensemble conforme sur le top-K** : compté désormais sur le classement complet (`Insights.aboveTau`),
  borne documentée en mode distant. — fait
- **Rappel de l'index ≠ reconnaissance**, banc = index seul, filtres linéaires en Python, service =
  démonstration : écrit noir sur blanc dans le README § 17. — fait
- **Chaîne de preuve** : qualifiée d'intégrité de fichier ; manquent identité de l'opérateur, droits d'accès,
  journal d'audit protégé. — documenté, à faire
- **Service** : validation des entrées, limites d'upload (25 Mo, images seules), 15 tests pytest sans réseau. — fait
- **Expérimentation contre intégration** : bandeau en tête du § 16 ; l'application reste sur CLIP. — fait

Reste, dans cet ordre et avant tout nouveau modèle : journal d'audit et identité d'opérateur côté service ;
préfiltre indexé pour les attributs ; mesure du coût complet d'une requête (API + filtre + réseau).

## Allègement (6 novembre 2026)

Relecture critique de ce qui avait été ajouté : moins de code, mêmes performances mesurées.

- La page Contrôle utilise `InsightsPanel` (mode empilé) au lieu de réafficher la lecture à sa façon :
  −200 lignes, une seule source pour les textes de confiance. — fait
- `scripts/lib/` (modèles, métriques, partition, corpus) partagé par les scripts ; `experiments/` sépare les
  expériences (tête apprise, ré-ordonnancement) de l'opérationnel. — fait
- Retirés après mesure : score « voisins mutuels », DINOv2 base, `eval/heads/` du suivi git. — fait
- `items.json` (44 Ko) + `embeddings.bin` (Float32, 128 Ko) au lieu de 3 Mo de JSON ; vecteurs lus une fois
  dans une `Map`, écart index/recalcul 0,0001. — fait
- `schema.similarity.reliable` supprimé : τ fait foi ; sans calibration, seuil `strong`. — fait
- `api/shared.ts` pour ce que les adapters local et distant dupliquaient. — fait
- Préchargement du modèle au survol de la zone de dépôt ; Leaflet était déjà chargé à la demande. — fait

## Automatisation (9 novembre 2026)

Ce qui se faisait à la main et ne peut plus régresser en silence.

- **Garde-fou sur la recherche** : `scripts/evaluate.mjs --check` compare au `eval/results.json` versionné sans
  l'écraser et échoue si recall@1, recall@5, category@1 ou le MRR perdent plus que l'effet d'une requête, ou si
  `embeddings.bin` s'écarte de plus de 0,02 du modèle. Workflow `evaluation.yml` : à chaque changement du moteur,
  des données ou des scripts, et chaque semaine. Premier passage utile dès le jour même : il a montré que le même
  modèle épinglé donne des vecteurs à 0,013 près entre macOS et Linux, et qu'une requête sur 39 change de catégorie
  selon la machine ; les seuils tiennent compte de ce bruit de plateforme. — fait
- **τ lu, plus recopié** : le schéma importe `eval/calibration-clip.json` et prend la ligne α = 0,1 ; un test
  vérifie que le modèle du fichier est celui du navigateur. — fait
- **Révision du modèle épinglée** : `src/lib/ml/model.ts` fixe l'empreinte git des poids Hugging Face, utilisée
  par le worker, le repli, `build-data.mjs` et `scripts/lib/models.mjs` ; un test vérifie que les quatre
  concordent. Sans cela, une republication des poids ferait diverger requêtes et index sans erreur. — fait
- **Tests du service en CI** : job Python parallèle au build ; le déploiement attend les deux. — fait
- **Cohérence de la page d'architecture** : test qui résout chaque fichier cité et exige que tout `src/` y
  figure (treize fichiers manquants ajoutés aux briques à cette occasion). — fait
- **Rafraîchissement des données** : `data-refresh.yml` reconstruit mensuellement, vérifie l'absence de
  régression, ouvre une pull request. — fait
- **Hygiène** : ESLint sans formateur (le style du code reste tel quel), hook de pré-commit (lint + tests),
  `npm audit --omit=dev` en CI, seuil de couverture à 50 % de lignes sur tout `src/lib` (56 % mesurés, fichiers non importés compris), Dependabot
  hebdomadaire npm, pip et Actions. — fait
- Non automatisé, à dessein : les états de ce document, et la mise à jour de `eval/results.json`, qui reste
  un geste délibéré (`npm run evaluate`) après un changement voulu.

## Migrations majeures (9 novembre 2026)

Faites une à la fois, chaîne complète entre chaque étape (types, lint, tests, build, parcours de bout en bout).

- **Playwright 1.65, types Leaflet** : sans changement de code. — fait
- **SvelteKit 3, Vite 8 (rolldown), vite-plugin-svelte 7, TypeScript 6, Vitest 5, Node ≥ 22.17** : migration
  automatique (`npx sv migrate sveltekit-3`) limitée aux tâches de renommage (`$lib` → `#lib` avec extensions,
  `$app/environment` → `$app/env`), le reste à la main pour ne pas reformater 45 fichiers : `base` remplacé par
  `asset()` pour les fichiers statiques et `resolve()` pour les routes, état de navigation lu sur `page.route.id`,
  `replaceState` → `goto(url, { shallow: true, replace: true })`, service worker dans son propre projet TypeScript
  (`$app/manifest` + portée d'enregistrement pour le chemin de base), configuration SvelteKit déplacée dans
  `vite.config.ts`. Vitest 5 compte désormais tous les fichiers de `src/lib`, importés ou non : la couverture
  réelle était 36 % ; après les tests des adapters, des stores et du dossier (ci-dessous), 56 %, seuil à 50 %. — fait
- **transformers.js 4.3** (onnxruntime 1.30, sharp 0.35) : mesuré avant d'être accepté. Côté Node, les vecteurs du
  corpus s'écartent de 0,013 de `embeddings.bin` (le même ordre que l'écart entre deux machines), recall@1 64,1 → 66,7,
  origin@1 71,8 → 74,4, category@1 82,1 → 79,5 (une requête) : pas de régression, index conservé. Côté navigateur,
  inférence réelle vérifiée sur le build (Playwright : premier résultat correct, service worker enregistré, aucune
  erreur de console). Le cache de l'évaluation porte désormais la version de la bibliothèque et la révision du
  modèle : un changement de l'un ou l'autre force le recalcul au lieu de comparer des vecteurs d'origines différentes. — fait

## Tests qui portent le risque (9 novembre 2026)

- **Recherche par image de bout en bout, en CI** : deux parcours Playwright chargent le modèle CLIP dans le worker du
  navigateur sur le build, vectorisent une vue alternative d'un objet du corpus et exigent cet objet en premier, le
  panneau de lecture affiché et aucune erreur de console. Les 90 Mo de poids sont servis depuis le cache de
  transformers.js par un petit serveur local avec redirection (les servir directement par `route.fulfill` ferme la
  page dans Chromium) ; en CI, le cache du workflow d'évaluation est restauré avant les parcours. 4 s par parcours
  avec le cache. C'est le test qui attraperait un changement silencieux de prétraitement. — fait
- **Adapters avec `fetch` et embedder simulés** : chargement unique des données, refus d'un `embeddings.bin` de mauvaise
  taille, classement par cosinus et arrondi, filtres et texte avant le tri, pagination ; côté distant, refus d'un index
  calculé avec un autre modèle, requête `POST /search` envoyée avec le vecteur et jamais l'image, lecture agrégée sur
  les candidats, `/meta` interrogé une fois, 404 → null, archivage multipart avec empreinte et métadonnées. — fait
- **Stores de session et dossier exporté** : photo de référence sans l'image, décision horodatée et annulable, relecture
  au rechargement, sélection pour comparaison plafonnée à quatre, forme du dossier (listes rouges par candidat, nom
  horodaté). — fait
- Piège rencontré avec Vitest 5 : une fonction rendue par `beforeEach` est appelée comme nettoyage ; `beforeEach(() =>
  spy.mockClear())` appelait donc l'embedder simulé sans argument. Accolades partout.
- Non testé à dessein : thème, drapeaux, repli d'image, redimensionnement canvas. Ça ferait monter le chiffre sans
  protéger quoi que ce soit.

## Recherche par description (9 novembre 2026)

Tour texte de CLIP dans le worker (`embedText`, 64 Mo int8, chargée à la demande) ; le bouton « Par description » de
l'explorateur transforme la barre de recherche en requête visuelle : le texte est vectorisé et comparé aux images au lieu
de filtrer les métadonnées, moyenné avec la photo s'il y en a une. Pas de lecture agrégée ni de τ dans ce mode (calibrés
image contre image). Mesure `evaluate --text` : le titre du musée retrouve l'image de l'objet au premier rang dans 53 %
des cas, dans les 5 premiers dans 88 %, les 10 premiers dans 94 % (MRR 0,66). Les deux adapters le supportent (le service
reçoit le vecteur et un texte vide). — fait

## Robustesse au terrain, mesurée (9 novembre 2026)

`scripts/robustness.mjs` dégrade les 39 requêtes (flou, sous-exposition, rotation 15°, recadrage 60 %, JPEG 25, 320 px,
flou + sombre) et les rejoue contre l'index. Compression et basse résolution : aucun coût. Flou : classement intact
mais 8 % de « non concluant » en plus. Sous-exposition : −8 points de recall@1. Rotation : −13. Cadrage partiel : −18 et
15 % de « non concluant ». La limite « calibré sur des vues de studio » a maintenant des chiffres, et ils désignent la
prise de vue guidée comme prochain gain, avant tout changement de modèle. Table dans le README § 16, données dans
`eval/robustness.json`. — fait

## Réserves

Les gains cités viennent de benchmarks de monuments (Oxford, Paris), pas d'antiquités : ils se
vérifient sur nos données ou ne valent rien. 39 requêtes orientent, ne tranchent pas. La prédiction
conforme garantit la couverture **sur la distribution de calibration** : calibrer sur des vues de studio
ne garantit rien sur des photos de comptoir — d'où l'importance d'une collecte de photos de terrain
annotées avant toute mise en service.
