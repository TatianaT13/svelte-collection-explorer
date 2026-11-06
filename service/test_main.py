"""
Tests du service d'index, sans réseau : TestClient en mémoire, archive redirigée vers un dossier temporaire.

    npm run test:service        # PYTHONPATH=. service/.venv/bin/python -m pytest service -q
"""
import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import service.main as m

client = TestClient(m.app)
FIRST = m.items[0]
FIRST_VECTOR = m.vectors[0].tolist()
THUMB = m.ROOT / "static/data/thumbs" / f"{FIRST['id']}.jpg"


@pytest.fixture(autouse=True)
def tmp_archive(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "ARCHIVE", tmp_path / "archive")
    yield tmp_path / "archive"


def test_meta_expose_le_modele_de_l_index():
    r = client.get("/meta").json()
    assert r["model"] == "Xenova/clip-vit-base-patch32"
    assert r["dim"] == m.DIM and r["count"] == len(m.items)


def test_recherche_texte_et_filtre():
    assert client.post("/search", json={"text": "icon"}).json()["total"] >= 9
    r = client.post("/search", json={"filters": {"origin": "UA"}, "pageSize": 3}).json()
    assert r["total"] == 8 and len(r["items"]) == 3
    assert client.post("/search", json={"filters": {"origin": ["UA", "RU"]}}).json()["total"] == 13


def test_cle_de_filtre_inconnue_refusee():
    r = client.post("/search", json={"filters": {"couleur": "rouge"}})
    assert r.status_code == 400 and "couleur" in r.json()["detail"]


def test_recherche_vectorielle_retrouve_l_objet_lui_meme():
    r = client.post("/search", json={"vector": FIRST_VECTOR, "candidates": 5}).json()
    assert r["candidates"][0]["id"] == FIRST["id"]
    assert r["candidates"][0]["score"] == 1.0
    assert "embedding" not in r["candidates"][0]


def test_recherche_vectorielle_filtree_dans_l_index():
    r = client.post("/search", json={"vector": FIRST_VECTOR, "filters": {"category": "icon"}, "candidates": 50}).json()
    assert r["total"] == 9
    assert all(c["metadata"]["category"] == "icon" for c in r["candidates"])


def test_vecteur_mauvaise_dimension():
    assert client.post("/search", json={"vector": [0.1] * (m.DIM - 1)}).status_code == 400


def test_bornes_de_pagination():
    assert client.post("/search", json={"pageSize": 0}).status_code == 422
    assert client.post("/search", json={"pageSize": 1000}).status_code == 422
    assert client.post("/search", json={"candidates": 10_000}).status_code == 422
    assert client.post("/search", json={"text": "x" * 201}).status_code == 422


def test_objet_et_404():
    assert client.get(f"/items/{FIRST['id']}").json()["title"] == FIRST["title"]
    assert client.get("/items/inconnu").status_code == 404


def test_facettes_reelles():
    f = client.get("/facets").json()
    assert "UA" in f["origin"] and "icon" in f["category"]


def test_archive_conserve_et_verifie(tmp_archive):
    data = THUMB.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    r = client.post("/archive", files={"file": ("photo.jpg", data, "image/jpeg")}, data={"sha256": digest, "info": json.dumps({"camera": "test"})})
    assert r.status_code == 200
    receipt = r.json()
    assert receipt["sha256"] == digest
    stored = list(tmp_archive.glob(f"{receipt['id']}.*"))
    assert len(stored) == 2
    meta = json.loads((tmp_archive / f"{receipt['id']}.json").read_text())
    assert meta["info"] == {"camera": "test"} and meta["bytes"] == len(data)


def test_archive_refuse_une_empreinte_differente():
    data = THUMB.read_bytes()
    r = client.post("/archive", files={"file": ("photo.jpg", data, "image/jpeg")}, data={"sha256": "0" * 64})
    assert r.status_code == 409


def test_archive_refuse_une_empreinte_malformee():
    r = client.post("/archive", files={"file": ("photo.jpg", b"x", "image/jpeg")}, data={"sha256": "deadbeef"})
    assert r.status_code == 400


def test_archive_refuse_un_type_non_image():
    r = client.post("/archive", files={"file": ("notes.txt", b"bonjour", "text/plain")})
    assert r.status_code == 415


def test_archive_refuse_un_fichier_trop_gros(monkeypatch):
    monkeypatch.setattr(m, "MAX_UPLOAD_BYTES", 10)
    r = client.post("/archive", files={"file": ("photo.jpg", b"x" * 11, "image/jpeg")})
    assert r.status_code == 413


def test_archive_refuse_des_metadonnees_invalides():
    r = client.post("/archive", files={"file": ("photo.jpg", b"x", "image/jpeg")}, data={"info": "{pas du json"})
    assert r.status_code == 400
