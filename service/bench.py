"""
Passage à l'échelle : force brute contre HNSW, sur des corpus synthétiques construits à partir des
vecteurs réels (chaque vecteur synthétique est un vecteur réel bruité, pour garder une structure en
grappes plausible plutôt qu'un nuage uniforme).

    service/.venv/bin/python service/bench.py                 # 1 000, 10 000, 100 000
    service/.venv/bin/python service/bench.py --sizes 1000000 # 1 M (≈ 2 Go de vecteurs CLIP en float32)

Pour chaque taille : temps de construction de l'index, latence médiane d'une requête en force brute
(produit matriciel numpy, exact) et en HNSW (approché), et recall@10 de HNSW par rapport à l'exact.
"""
import argparse
import json
import time
from pathlib import Path

import hnswlib
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
QUERIES = 50
K = 10


def load_real() -> np.ndarray:
    meta = json.loads((ROOT / "static/data/items.json").read_text())
    v = np.fromfile(ROOT / "static/data/embeddings.bin", dtype=np.float32).reshape(len(meta["items"]), meta["dim"])
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def synthetic(real: np.ndarray, n: int, sigma: float, rng: np.random.Generator) -> np.ndarray:
    idx = rng.integers(0, len(real), n)
    v = real[idx] + rng.normal(0, sigma, (n, real.shape[1])).astype(np.float32)
    return v / np.linalg.norm(v, axis=1, keepdims=True)


# σ par dimension : en 512-d, le bruit a une norme σ·√512 ; 0,035 donne ≈ 0,8 de norme, soit un cosinus
# d'environ 0,8 avec le vecteur réel — l'ordre de grandeur d'une vue alternative du même objet.
# (Avec σ = 0,3, le bruit noie le signal : nuage uniforme, le pire cas de tout index approché.)
SIGMA = 0.035


def bench(n: int, real: np.ndarray, rng: np.random.Generator) -> dict:
    corpus = synthetic(real, n, SIGMA, rng)
    queries = synthetic(real, QUERIES, SIGMA, rng)

    t0 = time.perf_counter()
    index = hnswlib.Index(space="ip", dim=corpus.shape[1])
    index.init_index(max_elements=n, ef_construction=200, M=16)
    index.add_items(corpus, np.arange(n))
    index.set_ef(128)
    build = time.perf_counter() - t0

    exact_ids, brute_ms = [], []
    for q in queries:
        t0 = time.perf_counter()
        with np.errstate(all="ignore"):  # avertissements parasites du BLAS d'Apple en float32, valeurs correctes
            s = corpus @ q
        top = np.argpartition(-s, K)[:K]
        exact_ids.append(set(top[np.argsort(-s[top])].tolist()))
        brute_ms.append((time.perf_counter() - t0) * 1000)

    hnsw_ids, hnsw_ms = [], []
    for q in queries:
        t0 = time.perf_counter()
        labels, _ = index.knn_query(q, k=K)
        hnsw_ms.append((time.perf_counter() - t0) * 1000)
        hnsw_ids.append(set(labels[0].tolist()))

    recall = float(np.mean([len(a & b) / K for a, b in zip(exact_ids, hnsw_ids)]))
    return {
        "n": n,
        "build_s": round(build, 2),
        "brute_ms": round(float(np.median(brute_ms)), 3),
        "hnsw_ms": round(float(np.median(hnsw_ms)), 3),
        "speedup": round(float(np.median(brute_ms) / max(np.median(hnsw_ms), 1e-6)), 1),
        "recall@10": round(recall * 100, 1),
        "memory_mb": round(corpus.nbytes / 1e6, 1),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sizes", type=int, nargs="+", default=[1_000, 10_000, 100_000])
    args = ap.parse_args()
    real = load_real()
    rng = np.random.default_rng(0)
    rows = [bench(n, real, rng) for n in args.sizes]
    print("| objets | construction (s) | force brute (ms) | HNSW (ms) | accélération | recall@10 HNSW | vecteurs (Mo) |")
    print("|---:|---:|---:|---:|---:|---:|---:|")
    for r in rows:
        print(f"| {r['n']:,} | {r['build_s']} | {r['brute_ms']} | {r['hnsw_ms']} | ×{r['speedup']} | {r['recall@10']} % | {r['memory_mb']} |".replace(",", " "))
    (ROOT / "eval").mkdir(exist_ok=True)
    (ROOT / "eval/bench-index.json").write_text(json.dumps({"dim": int(real.shape[1]), "queries": QUERIES, "k": K, "rows": rows}, indent=2))
    print("écrit eval/bench-index.json")


if __name__ == "__main__":
    main()
