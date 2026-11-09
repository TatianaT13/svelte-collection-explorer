/**
 * Le modèle d'embedding, épinglé à une révision du dépôt Hugging Face : le navigateur, l'index
 * (scripts/build-data.mjs) et les mesures (scripts/lib/models.mjs) doivent charger exactement les mêmes poids.
 * Sans révision, une republication silencieuse des poids ferait diverger requêtes et index sans aucune erreur.
 * Un test vérifie que les scripts citent la même révision.
 */
export const MODEL_ID = 'Xenova/clip-vit-base-patch32';
export const MODEL_REVISION = '6b7c523703ae26e39be4b03774966f8571c7f523';
