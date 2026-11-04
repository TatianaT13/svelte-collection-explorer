"""
Service d'index pour l'adapter distant (src/lib/api/remoteAdapter.ts).

L'inférence reste dans le navigateur : le client envoie un vecteur, jamais une image de recherche.
Ici : les vecteurs du corpus dans un index HNSW (hnswlib), les métadonnées en mémoire, et une archive
des originaux avec vérification de l'empreinte SHA-256 annoncée par le client (chaîne de preuve).
Autonome : aucun appel sortant, aucune dépendance réseau ; se lance sur un poste isolé.

    service/.venv/bin/uvicorn service.main:app --port 8000
    VITE_ADAPTER=remote npm run dev

Le même corpus que l'adapter local (static/data/items.json) : les embeddings y sont calculés par le
modèle que le navigateur charge, et /meta expose son identifiant pour que le client le vérifie.
"""
import hashlib
import json
import time
import uuid
from pathlib import Path
from typing import Any

import hnswlib
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "static/data/items.json"
PLACES = ROOT / "static/data/places.json"
ARCHIVE = Path(__file__).resolve().parent / "archive"

# ---------- corpus ----------

dataset = json.loads(DATA.read_text())
items: list[dict[str, Any]] = dataset["items"]
vectors = np.array([it["embedding"] for it in items], dtype=np.float32)
vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)  # arrondis à 4 décimales dans le fichier
DIM = int(vectors.shape[1])
public = [{k: v for k, v in it.items() if k != "embedding"} for it in items]
row_by_id = {it["id"]: i for i, it in enumerate(items)}

places: dict[str, dict] = json.loads(PLACES.read_text())["places"] if PLACES.exists() else {}


def self_and_ancestors(place_id: str) -> set[str]:
    out, cur = set(), place_id
    for _ in range(8):
        if not cur or cur in out:
            break
        out.add(cur)
        cur = places.get(cur, {}).get("parent")
    return out


# Produit scalaire sur des vecteurs normalisés = cosinus.
t0 = time.perf_counter()
index = hnswlib.Index(space="ip", dim=DIM)
index.init_index(max_elements=len(items), ef_construction=200, M=16)
index.add_items(vectors, np.arange(len(items)))
index.set_ef(64)
BUILD_S = round(time.perf_counter() - t0, 3)

# Champs du schéma côté client : on ne reproduit que ce qui change la sémantique d'un filtre.
TEXT_FIELDS = {"description", "inscriptions", "distinguishing_features", "maker", "date_text", "inventory", "source"}
NUMBER_FIELDS = {"year", "height_cm", "width_cm", "depth_cm", "weight_g"}
PLACE_FIELDS = {"place"}
FACET_FIELDS = ["category", "origin", "place", "period", "material", "technique", "subject"]


def as_list(v: Any) -> list[str]:
    if v is None:
        return []
    return [str(x) for x in v] if isinstance(v, list) else [str(v)]


def matches_filters(it: dict, filters: dict[str, Any]) -> bool:
    for key, wanted in filters.items():
        if wanted in (None, "", []):
            continue
        actual = as_list(it["metadata"].get(key))
        wanted_list = as_list(wanted)
        if key in TEXT_FIELDS:
            if wanted_list[0].lower() not in " ".join(actual).lower():
                return False
        elif key in NUMBER_FIELDS:
            try:
                if float(it["metadata"].get(key) or "nan") < float(wanted_list[0]):
                    return False
            except ValueError:
                return False
        elif key in PLACE_FIELDS:
            own = set().union(*(self_and_ancestors(a) for a in actual)) if actual else set()
            if not any(w in own for w in wanted_list):
                return False
        else:
            lower = {a.lower() for a in actual}
            if not any(w.lower() in lower for w in wanted_list):
                return False
    return True


def searchable(it: dict) -> str:
    parts = [it["title"]]
    for v in it["metadata"].values():
        parts.extend(as_list(v))
    return " ".join(parts).lower()


SEARCHABLE = [searchable(it) for it in items]


def matches_text(i: int, text: str) -> bool:
    return not text or text.lower() in SEARCHABLE[i]


# ---------- API ----------

app = FastAPI(title="svelte-collection-explorer · index")
# Démonstration locale : le front de développement (5173) ou le build servi ailleurs doivent pouvoir appeler le service.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class SearchQuery(BaseModel):
    text: str = ""
    filters: dict[str, Any] = {}
    vector: list[float] | None = None
    page: int = 1
    pageSize: int = 12
    candidates: int = 200


@app.get("/meta")
def meta() -> dict:
    return {"model": dataset["model"], "dim": DIM, "count": len(items), "generatedAt": dataset["generatedAt"], "index": "hnswlib", "buildSeconds": BUILD_S}


@app.post("/search")
def search(q: SearchQuery) -> dict:
    allowed = [i for i in range(len(items)) if matches_filters(items[i], q.filters) and matches_text(i, q.text)]
    if q.vector is not None:
        if len(q.vector) != DIM:
            raise HTTPException(400, f"vecteur de dimension {len(q.vector)}, index en {DIM}")
        v = np.asarray(q.vector, dtype=np.float32)
        v /= np.linalg.norm(v) or 1.0
        allowed_set = set(allowed)
        k = min(len(allowed), max(q.candidates, q.page * q.pageSize))
        if k == 0:
            ranked: list[tuple[int, float]] = []
        else:
            # Recherche filtrée : l'index n'explore que les objets qui passent les filtres.
            labels, dist = index.knn_query(v, k=k, filter=lambda label: label in allowed_set)
            ranked = [(int(l), round(float(1.0 - d), 3)) for l, d in zip(labels[0], dist[0])]
        scored = [{**public[i], "score": s} for i, s in ranked]
        total = len(allowed)
    else:
        scored = [public[i] for i in allowed]
        total = len(allowed)
    start = (q.page - 1) * q.pageSize
    return {"items": scored[start : start + q.pageSize], "total": total, "page": q.page, "pageSize": q.pageSize, "candidates": scored[: q.candidates]}


@app.get("/items/{item_id}")
def get_item(item_id: str) -> dict:
    i = row_by_id.get(item_id)
    if i is None:
        raise HTTPException(404, "objet inconnu")
    return public[i]


@app.get("/facets")
def facets() -> dict[str, list[str]]:
    out: dict[str, set[str]] = {k: set() for k in FACET_FIELDS}
    for it in items:
        for k in FACET_FIELDS:
            out[k].update(v for v in as_list(it["metadata"].get(k)) if v)
    return {k: sorted(v) for k, v in out.items()}


@app.post("/archive")
async def archive(file: UploadFile = File(...), sha256: str | None = Form(None), info: str | None = Form(None)) -> dict:
    """Conserve l'original tel quel. L'empreinte est recalculée ici : si le client en a annoncé une
    différente, l'archivage est refusé — le fichier reçu n'est pas celui qui a été analysé."""
    data = await file.read()
    digest = hashlib.sha256(data).hexdigest()
    if sha256 and sha256.lower() != digest:
        raise HTTPException(409, f"empreinte annoncée {sha256[:12]}… ≠ calculée {digest[:12]}…")
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    receipt_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"
    suffix = Path(file.filename or "").suffix or ".bin"
    (ARCHIVE / f"{receipt_id}{suffix}").write_bytes(data)
    (ARCHIVE / f"{receipt_id}.json").write_text(
        json.dumps({"id": receipt_id, "sha256": digest, "bytes": len(data), "filename": file.filename, "receivedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "info": json.loads(info) if info else None}, indent=2)
    )
    return {"id": receipt_id, "sha256": digest}
