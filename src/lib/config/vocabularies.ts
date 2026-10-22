/**
 * Vocabulaires contrôlés : listes de termes à code stable et libellé localisé.
 *
 * Même principe que les pays : on stocke le code, on affiche le libellé.
 * Les listes s'inspirent du standard Object ID (ICOM / Interpol / UNESCO) pour la
 * description des biens culturels, et des grandes facettes du Getty AAT.
 * Pour enrichir : ajouter une ligne, le front se met à jour partout.
 */

export interface Term {
  code: string;
  label: Record<string, string>;
  /** Ordre d'affichage explicite (périodes). Sinon tri alphabétique. */
  order?: number;
}

export type VocabularyId = 'category' | 'material' | 'technique' | 'period' | 'subject';

const t = (code: string, fr: string, en: string, order?: number): Term => ({
  code,
  label: { fr, en },
  ...(order !== undefined ? { order } : {})
});

export const vocabularies: Record<VocabularyId, Term[]> = {
  /** Type d'objet (Object ID : "Type of object"). */
  category: [
    t('painting', 'Peinture', 'Painting'),
    t('drawing', 'Dessin', 'Drawing'),
    t('print', 'Estampe', 'Print'),
    t('photograph', 'Photographie', 'Photograph'),
    t('sculpture', 'Sculpture', 'Sculpture'),
    t('relief', 'Relief', 'Relief'),
    t('icon', 'Icône', 'Icon'),
    t('manuscript', 'Manuscrit', 'Manuscript'),
    t('book', 'Livre', 'Book'),
    t('document', 'Document', 'Document'),
    t('map', 'Carte', 'Map'),
    t('coin', 'Monnaie', 'Coin'),
    t('medal', 'Médaille', 'Medal'),
    t('banknote', 'Billet', 'Banknote'),
    t('seal', 'Sceau', 'Seal'),
    t('jewellery', 'Bijou', 'Jewellery'),
    t('ceramic', 'Céramique', 'Ceramic'),
    t('glassware', 'Verrerie', 'Glassware'),
    t('metalwork', 'Orfèvrerie / métal', 'Metalwork'),
    t('weapon', 'Arme', 'Weapon'),
    t('armour', 'Armure', 'Armour'),
    t('furniture', 'Mobilier', 'Furniture'),
    t('textile', 'Textile', 'Textile'),
    t('carpet', 'Tapis', 'Carpet'),
    t('costume', 'Costume', 'Costume'),
    t('musical-instrument', 'Instrument de musique', 'Musical instrument'),
    t('clock', 'Horlogerie', 'Clock'),
    t('tool', 'Outil', 'Tool'),
    t('vessel', 'Vase / récipient', 'Vessel'),
    t('figurine', 'Figurine', 'Figurine'),
    t('mask', 'Masque', 'Mask'),
    t('religious-object', 'Objet religieux', 'Religious object'),
    t('liturgical-object', 'Objet liturgique', 'Liturgical object'),
    t('archaeological-fragment', 'Fragment archéologique', 'Archaeological fragment'),
    t('fossil', 'Fossile', 'Fossil'),
    t('mineral', 'Minéral', 'Mineral'),
    t('natural-specimen', 'Spécimen naturel', 'Natural specimen'),
    t('ethnographic-object', 'Objet ethnographique', 'Ethnographic object'),
    t('toy', 'Jouet', 'Toy'),
    t('other', 'Autre', 'Other')
  ],

  /** Matériau (Object ID : "Materials & techniques"). */
  material: [
    t('wood', 'Bois', 'Wood'),
    t('stone', 'Pierre', 'Stone'),
    t('marble', 'Marbre', 'Marble'),
    t('limestone', 'Calcaire', 'Limestone'),
    t('sandstone', 'Grès', 'Sandstone'),
    t('granite', 'Granit', 'Granite'),
    t('alabaster', 'Albâtre', 'Alabaster'),
    t('clay', 'Argile', 'Clay'),
    t('terracotta', 'Terre cuite', 'Terracotta'),
    t('earthenware', 'Faïence', 'Earthenware'),
    t('stoneware', 'Grès cérame', 'Stoneware'),
    t('porcelain', 'Porcelaine', 'Porcelain'),
    t('glass', 'Verre', 'Glass'),
    t('enamel', 'Émail', 'Enamel'),
    t('bronze', 'Bronze', 'Bronze'),
    t('copper', 'Cuivre', 'Copper'),
    t('brass', 'Laiton', 'Brass'),
    t('iron', 'Fer', 'Iron'),
    t('steel', 'Acier', 'Steel'),
    t('silver', 'Argent', 'Silver'),
    t('gold', 'Or', 'Gold'),
    t('lead', 'Plomb', 'Lead'),
    t('tin', 'Étain', 'Tin'),
    t('bone', 'Os', 'Bone'),
    t('ivory', 'Ivoire', 'Ivory'),
    t('horn', 'Corne', 'Horn'),
    t('shell', 'Coquillage / nacre', 'Shell'),
    t('amber', 'Ambre', 'Amber'),
    t('coral', 'Corail', 'Coral'),
    t('pearl', 'Perle', 'Pearl'),
    t('leather', 'Cuir', 'Leather'),
    t('parchment', 'Parchemin', 'Parchment'),
    t('paper', 'Papier', 'Paper'),
    t('papyrus', 'Papyrus', 'Papyrus'),
    t('linen', 'Lin', 'Linen'),
    t('wool', 'Laine', 'Wool'),
    t('silk', 'Soie', 'Silk'),
    t('cotton', 'Coton', 'Cotton'),
    t('canvas', 'Toile', 'Canvas'),
    t('oil-paint', 'Peinture à l’huile', 'Oil paint'),
    t('tempera', 'Tempera', 'Tempera'),
    t('watercolour', 'Aquarelle', 'Watercolour'),
    t('ink', 'Encre', 'Ink'),
    t('pigment', 'Pigment', 'Pigment'),
    t('gesso', 'Gesso', 'Gesso'),
    t('lacquer', 'Laque', 'Lacquer'),
    t('plaster', 'Plâtre', 'Plaster'),
    t('wax', 'Cire', 'Wax'),
    t('plastic', 'Plastique', 'Plastic'),
    t('other', 'Autre', 'Other')
  ],

  /** Technique de fabrication. */
  technique: [
    t('carved', 'Sculpté / taillé', 'Carved'),
    t('cast', 'Fondu / coulé', 'Cast'),
    t('forged', 'Forgé', 'Forged'),
    t('chased', 'Ciselé', 'Chased'),
    t('engraved', 'Gravé', 'Engraved'),
    t('embossed', 'Repoussé', 'Embossed'),
    t('gilded', 'Doré', 'Gilded'),
    t('inlaid', 'Incrusté / marqueté', 'Inlaid'),
    t('enamelled', 'Émaillé', 'Enamelled'),
    t('painted', 'Peint', 'Painted'),
    t('glazed', 'Glaçuré / vernissé', 'Glazed'),
    t('wheel-thrown', 'Tourné', 'Wheel-thrown'),
    t('moulded', 'Moulé', 'Moulded'),
    t('woven', 'Tissé', 'Woven'),
    t('embroidered', 'Brodé', 'Embroidered'),
    t('knotted', 'Noué', 'Knotted'),
    t('printed', 'Imprimé', 'Printed'),
    t('lithograph', 'Lithographie', 'Lithograph'),
    t('etching', 'Eau-forte', 'Etching'),
    t('woodcut', 'Gravure sur bois', 'Woodcut'),
    t('photographic', 'Photographique', 'Photographic'),
    t('assembled', 'Assemblé', 'Assembled'),
    t('welded', 'Soudé', 'Welded'),
    t('other', 'Autre', 'Other')
  ],

  /** Période (Object ID : "Date or period"), ordre chronologique. */
  period: [
    t('prehistory', 'Préhistoire', 'Prehistory', 10),
    t('bronze-age', 'Âge du bronze', 'Bronze Age', 20),
    t('iron-age', 'Âge du fer', 'Iron Age', 30),
    t('antiquity', 'Antiquité', 'Antiquity', 40),
    t('hellenistic', 'Époque hellénistique', 'Hellenistic', 50),
    t('roman', 'Époque romaine', 'Roman', 60),
    t('late-antiquity', 'Antiquité tardive', 'Late Antiquity', 70),
    t('byzantine', 'Byzantin', 'Byzantine', 80),
    t('early-medieval', 'Haut Moyen Âge', 'Early Middle Ages', 90),
    t('medieval', 'Moyen Âge', 'Middle Ages', 100),
    t('late-medieval', 'Bas Moyen Âge', 'Late Middle Ages', 110),
    t('renaissance', 'Renaissance', 'Renaissance', 120),
    t('baroque', 'Baroque', 'Baroque', 130),
    t('18th', 'XVIIIe siècle', '18th century', 140),
    t('19th', 'XIXe siècle', '19th century', 150),
    t('early-20th', 'Début XXe siècle', 'Early 20th century', 160),
    t('interwar', 'Entre-deux-guerres', 'Interwar', 170),
    t('post-1945', 'Après 1945', 'Post-1945', 180),
    t('contemporary', 'Contemporain', 'Contemporary', 190),
    t('unknown', 'Indéterminée', 'Unknown', 999)
  ],

  /** Sujet / iconographie (Object ID : "Subject"). */
  subject: [
    t('religious', 'Religieux', 'Religious'),
    t('mythological', 'Mythologique', 'Mythological'),
    t('portrait', 'Portrait', 'Portrait'),
    t('landscape', 'Paysage', 'Landscape'),
    t('still-life', 'Nature morte', 'Still life'),
    t('genre-scene', 'Scène de genre', 'Genre scene'),
    t('historical', 'Historique', 'Historical'),
    t('animal', 'Animalier', 'Animal'),
    t('floral', 'Floral / végétal', 'Floral'),
    t('geometric', 'Géométrique', 'Geometric'),
    t('abstract', 'Abstrait', 'Abstract'),
    t('heraldic', 'Héraldique', 'Heraldic'),
    t('inscription', 'Inscription / texte', 'Inscription'),
    t('funerary', 'Funéraire', 'Funerary'),
    t('military', 'Militaire', 'Military'),
    t('maritime', 'Maritime', 'Maritime'),
    t('domestic', 'Vie domestique', 'Domestic'),
    t('other', 'Autre', 'Other')
  ]
};

export interface TermOption {
  code: string;
  name: string;
}

const optionsCache = new Map<string, TermOption[]>();

/** Libellé d'un terme dans la langue demandée (repli : anglais, puis code). */
export function termLabel(vocab: VocabularyId, code: string, locale: string): string {
  const term = vocabularies[vocab]?.find((x) => x.code === code);
  if (!term) return code;
  const lang = locale.split('-')[0];
  return term.label[lang] ?? term.label.en ?? code;
}

/** Options d'un vocabulaire, triées (ordre explicite, sinon alphabétique localisé). */
export function vocabOptions(vocab: VocabularyId, locale: string): TermOption[] {
  const key = `${vocab}:${locale}`;
  let opts = optionsCache.get(key);
  if (!opts) {
    const terms = vocabularies[vocab] ?? [];
    const collator = new Intl.Collator(locale);
    const hasOrder = terms.some((x) => x.order !== undefined);
    opts = terms
      .map((x) => ({ code: x.code, name: termLabel(vocab, x.code, locale), order: x.order ?? Infinity }))
      .sort((a, b) => (hasOrder ? a.order - b.order : collator.compare(a.name, b.name)))
      .map(({ code, name }) => ({ code, name }));
    optionsCache.set(key, opts);
  }
  return opts;
}

/** Tous les codes d'un vocabulaire (pratique pour les données de test). */
export function vocabCodes(vocab: VocabularyId): string[] {
  return vocabularies[vocab].map((x) => x.code);
}
