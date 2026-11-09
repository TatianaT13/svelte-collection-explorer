# Parcours technique de la donnée

Ce que devient une image, octet par octet, de la photo du musée au dossier de contrôle. Chaque étape donne
l'entrée, la transformation, la sortie, sa taille, le fichier qui la fait, et ce qui se perd ou se risque
à cet endroit. Les tailles sont celles du jeu de démonstration (64 objets du Met) et d'une photo de
téléphone typique.

Trois flux, qui ne se croisent qu'à un seul endroit, le fichier `embeddings.bin` :

- **A. Préparation** (hors ligne, une fois) : image du musée → vecteur de référence.
- **B. Contrôle** (à chaque photo, dans le navigateur) : photo de l'agent → vecteur → classement → lecture → décision → dossier.
- **C. Mesure** (hors ligne, après tout changement) : paires de vues → recall, seuil τ.

Le point clé, à retenir avant le détail : **l'image n'entre qu'une fois dans le modèle**. Tout ce qui suit
est de l'arithmétique sur des tableaux de 512 nombres.

---

## A. Préparation : du musée à l'index

| # | Entrée | Transformation | Sortie | Où |
|---|---|---|---|---|
| A1 | Thèmes de recherche (une vingtaine) | Appel à l'API du Met `v1.1/search`, garde domaine public + image | Liste d'identifiants | `scripts/build-data.mjs` |
| A2 | Fiche JSON du Met (titre, `medium`, `objectDate`, tags, `culture`, `country`) | Règles de mots-clés → codes du schéma : type, pays ISO, matériaux, techniques, période, sujet. Origine : pays enregistré par le musée (`recorded`), sinon déduit de la culture et marqué `inferred`, sinon vide | Métadonnées normalisées, ~700 octets par objet | `build-data.mjs` (`toOrigin`, `toPeriod`, tables de correspondance) |
| A3 | `primaryImageSmall` du Met (JPEG, 1 000 à 2 000 px) | Réduction au côté max 512 px, enregistrement JPEG | `static/data/thumbs/<id>.jpg`, ~33 Ko chacune, 2,1 Mo pour 64 | `build-data.mjs:427-429` |
| A4 | **La vignette telle que stockée** (relue depuis le disque) | Prétraitement CLIP puis modèle (révision Hugging Face épinglée, la même que le navigateur), voir B5 | Vecteur Float32 × 512, norme 1 | `build-data.mjs:433-436` |
| A5 | 64 vecteurs | Concaténation dans l'ordre des objets | `static/data/embeddings.bin` : 64 × 512 × 4 octets = **131 072 octets** | `build-data.mjs:473` |
| A6 | Métadonnées + `model` + `dim` | JSON | `static/data/items.json`, 45 Ko | `build-data.mjs:468-469` |
| A7 | Codes ISO des pays, identifiants de lieux | Une requête SPARQL Wikidata | `static/data/places.json`, 6 Ko (gazetier : libellés, coordonnées, parents) | `build-data.mjs:408` |

**Ce qui se perd ou se risque ici**

- A2 : la traduction par règles est le maillon le plus fragile. Un `medium` mal lu donne un matériau faux
  dans la lecture agrégée. L'année est prise dans `objectDate` affiché, pas dans `objectBeginDate` (un
  testeur avait eu « 1837 » pour un tableau de 1892).
- A3 → A4 : le vecteur est calculé **sur le JPEG relu**, pas sur l'image en mémoire avant compression.
  Avant cette correction, l'écart entre l'index et un recalcul était de 0,019 en cosinus (max 0,12) ;
  maintenant 0,0001. L'index doit décrire exactement l'artefact que l'on sert.
- A5 : rien ne lie `embeddings.bin` à `items.json` sauf l'ordre et le compte. L'adapter vérifie
  `longueur = n × dim` au chargement et refuse sinon.
- Changement de modèle = tout refaire depuis A4. Le champ `model` dans `items.json` et la route `/meta`
  du service existent pour détecter un mélange.

---

## B. Contrôle : de la photo de l'agent au dossier

### B1. La photo entre dans le navigateur

| Entrée | Transformation | Sortie | Où |
|---|---|---|---|
| `File` du téléphone, 12 Mpx, 4 à 8 Mo, JPEG ou HEIC converti | Dépôt ou prise de vue, zone optionnelle (`oncrop`) | L'original reste en mémoire ; un `File` recadré éventuel `-zone.jpg` | `src/lib/components/ImageUpload.svelte` |

Dès que la souris survole la zone de dépôt, le modèle commence à se télécharger (90 Mo, une fois, puis
cache du navigateur) : `ImageUpload.svelte:17-20` → `preloadModel()`.

### B2. Trois lectures en parallèle de l'original

| Lecture | Entrée | Calcul | Sortie | Où |
|---|---|---|---|---|
| Qualité | Copie ≤ 512 px | Luminance moyenne, écart-type, pixels saturés, variance du laplacien / variance de luminance | `PhotoMetrics` → conseils (`small`, `blur`, `dark`, `bright`, `glare`, `flat`), rien ne bloque | `src/lib/utils/photoQuality.ts:52` |
| Métadonnées | Octets de l'original | exifr : EXIF, IPTC, XMP (appareil, date, logiciel, GPS, auteur) | `ImageInfo`, marqué `stripped` si rien | `src/lib/api/imageInfo.ts:73` |
| Empreinte | Octets de l'original | SHA-256 par WebCrypto | 64 caractères hexadécimaux | `imageInfo.ts:40` |

L'empreinte identifie **le fichier**, pas l'objet : la même pièce rephotographiée donne une autre empreinte.
Les métadonnées sont indicatives, absentes dès que la photo a transité par une messagerie, et falsifiables.

### B3. Réduction avant analyse

| Entrée | Transformation | Sortie | Où |
|---|---|---|---|
| Original ou zone recadrée | Si > 2 Mo : côté max 1 600 px, JPEG qualité 0,85, orientation EXIF appliquée ; sinon tel quel | `imageToSend`, ~200 Ko | `src/lib/utils/resizeImage.ts:16`, politique dans `schema.upload` |

Cette réduction ne coûte rien au modèle, qui va de toute façon tout ramener à 224 px (B5). Elle sert à
l'adapter distant (moins d'octets à envoyer) et à la mémoire du worker.

### B4. Vers le worker

| Entrée | Transformation | Sortie | Où |
|---|---|---|---|
| `File` réduit | `queryEmbedding()` : cache par fichier (WeakMap), import dynamique de l'embedder, message `{ id, type: 'embed', blob }` au Web Worker | Promesse d'un `Float32Array` | `src/lib/api/shared.ts:38-46`, `src/lib/ml/embedder.ts` |

Le fil principal ne calcule rien : l'interface reste réactive pendant le chargement du modèle et
l'inférence. Repli sur le fil principal si les workers modules sont indisponibles.

### B5. La seule étape où l'image entre dans le modèle

Dans `src/lib/ml/embed.worker.ts:46-49`, quatre lignes :

| Ligne | Entrée | Transformation | Sortie |
|---|---|---|---|
| `RawImage.fromBlob(blob)` | JPEG | Décodage | Pixels RGB, par exemple 1 600 × 1 200 × 3 octets = 5,8 Mo |
| `processor(image)` | Pixels | Prétraitement CLIP (`preprocessor_config.json`) : conversion RGB, **redimensionnement du petit côté à 224 px** (bicubique), **recadrage central 224 × 224**, division par 255, normalisation par canal (moyenne 0,481 / 0,458 / 0,408 ; écart-type 0,269 / 0,261 / 0,276) | Tenseur 1 × 3 × 224 × 224 Float32 = 602 Ko |
| `vision(inputs)` | Tenseur | ViT-B/32 : découpe en 7 × 7 = 49 patches de 32 px + 1 jeton de classe, 12 couches d'attention en dimension 768, puis projection linéaire 768 → 512 ; poids quantifiés int8 | `image_embeds` : 512 Float32 |
| `.normalize(2, -1)` | 512 nombres | Division par la norme L2 | **Vecteur unitaire de 512 Float32 = 2 048 octets** |

Temps mesuré : 28 à 104 ms selon la machine (médiane 33 ms dans `eval/results.json`).

**C'est ici que l'information se perd, et c'est irréversible.**

- Une photo de 12 Mpx devient 50 176 pixels : inscriptions, motifs fins, signatures disparaissent avant
  que le modèle ne les voie. Le recadrage central coupe aussi les bords d'une photo non carrée. La zone
  (`oncrop`) et le re-classement MaxSim sur recadrages (59 → 69 % de recall@1, `experiments/rerank.mjs`)
  existent pour cette raison.
- Le modèle a été entraîné à rapprocher image et légende : il retient « vase à figures rouges, deux
  anses » et oublie la rayure à gauche. Bon pour la catégorie et l'origine, moins bon pour l'exemplaire exact.
- Les poids int8 : perte faible, non mesurée contre la version 32 bits.
- On ne peut pas reconstruire la photo depuis le vecteur. C'est une signature, pas une compression.

Plusieurs vues du même objet : un vecteur par vue, puis moyenne renormalisée (`shared.ts`, `averageNormalized`).

**Variante texte.** En mode « par description », la phrase passe par la tour texte de CLIP (tokenisation, 12 couches, projection vers les mêmes 512 dimensions, norme 1 ; `embed.worker.ts`, message `embedText`) et donne un vecteur du même espace, moyenné avec les images s'il y en a. Un texte et une image se comparent par le même cosinus, avec des scores plus bas (0,2 à 0,35) : classement seulement, pas de τ.

### B6. Classement

**Adapter local** (`src/lib/api/localAdapter.ts`), tout dans le navigateur :

| Entrée | Transformation | Sortie |
|---|---|---|
| `items.json` + `embeddings.bin` | Chargés une fois ; `Float32Array` sur le tampon, vues `subarray` par objet dans une `Map` id → vecteur (aucune copie) | 64 vecteurs en mémoire |
| Vecteur requête q, filtres, texte | Filtrage puis cosinus q · vᵢ pour chaque objet restant (512 multiplications par objet), arrondi à 3 décimales, tri décroissant | Liste classée avec `score` |

À 64 objets c'est 33 000 multiplications, invisible. À 100 000 ce serait 51 millions par requête et
200 Mo à télécharger : on passe au service.

**Adapter distant** (`src/lib/api/remoteAdapter.ts` → `service/main.py`) :

| Étape | Entrée | Transformation | Sortie |
|---|---|---|---|
| Client | q | `POST /search` avec `{ text, filters, vector: [512 nombres], page, pageSize, candidates: 200 }` ; **l'image ne part jamais** | ~10 Ko de JSON |
| Service | Vecteur | Validation (dimension, valeurs finies, clés de filtre connues, bornes), renormalisation | |
| Service | Filtres | Parcours Python de tous les objets (linéaire, à remplacer par un préfiltre indexé au-delà de quelques dizaines de milliers) | Ensemble `allowed` |
| Service | q, `allowed` | `hnswlib` espace `ip`, M = 16, ef = 64, `knn_query` filtré, k = max(200, page × pageSize) ; score = 1 − distance | Page demandée + 200 meilleurs candidats |
| Client | 200 candidats | Mêmes fonctions pures que le local (B7, B8) | Lecture identique |

Banc à 100 000 vecteurs synthétiques : 1,4 ms par requête contre 12 ms en force brute, recall@10 99,4 %
(`service/bench.py`). Le client vérifie `/meta` : si le modèle de l'index n'est pas celui du navigateur,
il refuse de chercher.

### B7. Lecture agrégée

`src/lib/api/insights.ts`, `computeInsights(ranked, topK = 12, tau)` :

| Entrée | Transformation | Sortie |
|---|---|---|
| Liste classée | Poids de chaque objet du top 12 : exp((s − meilleur) / 0,05), nul sous 0,5. À 10 points du meilleur un objet pèse 7 fois moins | Poids |
| Poids × métadonnées | Parts pondérées par valeur de `origin`, `place`, `category`, `material`, `technique`, `subject`, `period` (une valeur multiple partage le poids) | `Insights` : 3 origines, 3 types, 3 matériaux, 3 périodes… |
| Classement **complet** | Nombre d'objets de score ≥ τ | `aboveTau` (compté sur tout, pas sur le top 12) |

### B8. Lecture et décision

`src/lib/api/reading.ts`, `readInsights(insights, schema.similarity)` :

| Signal | Règle | Valeur actuelle |
|---|---|---|
| `reliable` | meilleur score ≥ τ calibré (sinon seuil `strong`) | τ = 0,747 |
| Ensemble conforme | objets ≥ τ ; vide = « résultat non concluant », pas « absent de la base » | α = 0,1, couverture visée 90 % sur le jeu de calibration, observée 81,6 % en test ; non vérifiée en conditions réelles |
| `confidence` | `strong` si meilleur ≥ 0,8 et part du type ≥ 0,6 ; `medium` si part ≥ 0,4 ; rétrogradé en cas d'hésitation | seuils dans `schema.similarity` |
| Hésitation | première part < 0,55, seconde ≥ 0,25, écart < 0,2 | deux hypothèses affichées |
| Risque | Listes rouges ICOM croisées (origine de part ≥ 0,15) × (type retenu) | `src/lib/config/risk.ts` |

L'agent décide : `hold`, `release` ou `expert` (`InsightsPanel.svelte`, `ondecide`). La décision est
enregistrée dans `lastQuery` avec le résumé de la lecture à cet instant.

### B9. Ce qui sort

| Sortie | Contenu | Format | Où |
|---|---|---|---|
| `QueryRecord` | nom, taille, SHA-256, date de prise de vue, appareil, recadrée ou non, décision, résumé | `sessionStorage`, sans l'image | `src/lib/stores/query.svelte.ts` |
| Dossier | horodatage, collection, **modèle et révision**, **base interrogée** (`adapter.info()`), **seuils** (τ, α, source), `QueryRecord`, lecture (meilleur score, fiabilité, ensemble conforme, types, origines, matériaux, périodes, risques), candidats (id, titre, score, métadonnées, listes rouges) | JSON téléchargé `dossier-AAAA-MM-JJ-hh-mm-ss.json` | `src/lib/utils/caseFile.ts` |
| Archive | **l'original** (pas la version réduite) + SHA-256 annoncé + `ImageInfo` sans GPS | `POST /archive` multipart, image/* seulement, 25 Mo max | `remoteAdapter.ts:93`, `service/main.py:195` |

Le service **recalcule** le SHA-256 sur les octets reçus ; s'il diffère de celui annoncé, 409 : le fichier
archivé n'est pas celui qui a été analysé. C'est une intégrité de fichier, pas une chaîne de preuve
complète (pas d'identité d'opérateur, pas de journal d'audit inaltérable). En local, `archiveImage` rend un
identifiant et l'empreinte lue côté client, rien n'est conservé.

Le dossier exporté porte le modèle, sa révision, la base interrogée et τ : un résultat se rejoue.

---

## C. Mesure : ce qui justifie les seuils

| # | Entrée | Transformation | Sortie | Où |
|---|---|---|---|---|
| C1 | 39 vues alternatives des objets du corpus (`eval/queries.json`) | Même chaîne que B5 sur chaque vue, cosinus contre `embeddings.bin` | recall@1 64,1 %, recall@5 89,7 %, MRR 0,765, category@1 82,1 %, origin@1 71,8 % | `scripts/evaluate.mjs`, `eval/results.json` |
| C2 | 400 objets du Met à deux vues | Vecteur de la vue principale et de la vue alternative | `eval/pairs/<modèle>.json` (ignoré par git) | `scripts/build-pairs.mjs` |
| C3 | Paires, partition par hachage de l'identifiant (lots 6–7 = calibration, 8–9 = test) | τ_α = ⌊α(n+1)⌋-ième plus petite similarité du bon objet sur la calibration | `eval/calibration-clip.json` : τ = 0,747 pour α = 0,1 | `scripts/calibrate.mjs`, `scripts/lib/metrics.mjs` |
| C4 | `eval/calibration-clip.json` | Importé par le schéma, qui prend la ligne α = 0,1 ; un test vérifie que le modèle du fichier est celui du navigateur | `schema.similarity.calibration` : le seuil que B8 utilise | `src/lib/config/schema.ts` (`calibrationFrom`) |
| C6 | Les 39 requêtes dégradées (flou, sombre, rotation, recadrage, compression, basse résolution) | Rejouées contre l'index | `eval/robustness.json` : la rotation et le cadrage partiel coûtent 13 et 18 points de recall@1, la compression rien | `scripts/robustness.mjs` |
| C5 (expérience) | Paires d'entraînement (lots 0–5) | Projection W 512 × 512 apprise par InfoNCE, rappelée vers l'identité | recall inchangé, marge +63 % ; non intégrée | `experiments/train-head.mjs` |

Le contrôle de dérive de C1 (écart entre `embeddings.bin` et un recalcul : 0,0001) est ce qui garantit que
les chiffres de C mesurent bien l'index que B6 utilise.

---

## Les tailles, en une ligne

```
photo 12 Mpx, 6 Mo  →  1 600 px, 200 Ko  →  tenseur 224×224×3, 602 Ko  →  vecteur 512 × Float32, 2 Ko
                                                                           ↓
                     64 vignettes 512 px, 2,1 Mo  →  embeddings.bin, 128 Ko  →  cosinus  →  12 scores  →  dossier JSON, quelques dizaines de Ko
```

Et pour une base d'un million d'objets : 2 Go de vecteurs Float32 (512 Mo en int8), 2 To de photos qui ne
sont jamais chargées pour chercher, une requête HNSW en quelques millisecondes, un vecteur de 2 Ko qui
quitte le poste.
