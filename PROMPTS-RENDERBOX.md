# RenderBox — tous les prompts du site

Mis à jour le 10 octobre 2026.

Ce fichier rassemble chaque prompt que RenderBox envoie aux moteurs (Visio et Pixel IA), action par action, avec ce qu'il fait et l'endroit du code où il vit. La partie A donne en plus les prompts « une seule fois » pour régénérer les images de l'éventail.

Pour remplacer un prompt : donne-moi son repère (par exemple « C3 – Esquisse ») et le nouveau texte, je l'intègre tel quel.

Règles pour écrire un prompt de remplacement :
- **En anglais** pour tout ce qui part au moteur : c'est la langue qu'ils suivent le mieux. Seuls les prompts des modèles de l'éventail (partie D) existent aussi en français, parce que l'utilisateur les voit dans la barre.
- **Générique** : le prompt s'applique à l'image de n'importe quel utilisateur. Parler de « the attached image », jamais d'un bâtiment précis (sauf dans la partie A, qui sert à fabriquer nos propres images).
- **Dire ce qu'on garde** autant que ce qu'on change (point de vue, proportions, matériaux…), sinon le moteur « réinvente » le bâtiment.
- **Texte dans l'image** : si on en veut (étiquettes, titres), le dire explicitement et demander « crisp, legible, spelled correctly » ; si on n'en veut pas, écrire « no text ».

---

## A. Prompts pour régénérer les images de l'éventail

L'éventail du Générateur d'images montre 4 images (Jour extérieur, Jour intérieur, Nuit extérieur, Nuit intérieur). Celles en place aujourd'hui sont les anciennes miniatures du menu, petites (300 × 400) : elles peuvent paraître un peu douces sur un écran haute définition. Ces prompts les refont en grand, sans joindre d'image.

**Réglages pour les quatre :** format portrait **3:4**, la plus grande taille possible (2K ou 4K), une seule image, aucune image jointe.

**Ensuite :** envoie-les-moi en disant laquelle est laquelle. Je les recadre en 3:4, je les mets dans `frontend/public/modeles/` (`jour-ext.webp`, `jour-int.webp`, `nuit-ext.webp`, `nuit-int.webp`) et je déploie.

### A1. Jour extérieur

```
A photorealistic architectural photograph of a contemporary eight-storey residential building with flowing curved white balconies wrapping around its facade, floor-to-ceiling glazing behind each balcony, and green planters with plants spilling over the balcony edges. Full daylight: bright natural sun, crisp cast shadows, clear blue sky with a few soft clouds. Seen from street level at a slight upward angle, the building filling most of the frame, mature trees with lush green foliage in the foreground on both sides. A few people walking on the pavement at the base, to scale. Soft reflections of the sky in the glass. High-end architectural photography, sharp, natural colours, realistic materials, no text, no watermark. Portrait 3:4.
```

### A2. Jour intérieur

```
A photorealistic interior photograph of a calm Mediterranean bedroom alcove with smooth warm beige plaster walls and rounded edges. A deep built-in daybed with thick natural linen cushions and a soft ivory throw, a woman peacefully asleep on it, partly covered by the throw. A deep window opening in the thick wall shows the blue sea and a rocky coastline outside, sheer white linen curtains moving slightly. Lit only by natural daylight through the window: warm sunlight falling across the cushions, soft ambient light, gentle shadows, no artificial lighting. Eye-level view, cosy and serene, a few small objects (a ceramic cup, a book) on a plaster ledge. High-end interior photography, realistic textures, natural colours, no text, no watermark. Portrait 3:4.
```

### A3. Nuit extérieur

```
A photorealistic architectural night photograph of a group of Mediterranean houses built into a rocky seaside hillside: rounded lime-plastered volumes in warm sand colour, dry-stone retaining walls, stone stairs climbing between terraces, agave and olive trees. Deep blue night sky, no sunlight. Warm golden light glowing from every doorway and window, discreet uplights along the stone walls, small path lights on the stairs. On the lowest terrace near the water, a sunken seating area with cushions around low tables and candle lanterns, a few people sitting and talking, to scale. Warm reflections on the stone. High-end architectural night photography, realistic materials, no text, no watermark. Portrait 3:4.
```

### A4. Nuit intérieur

```
A photorealistic interior night photograph of a luxurious boutique hotel lobby: tall walls clad in vertical dark oak slats, a long stone reception desk with a warm concealed LED strip glowing along its base, three slim black pendant lights hanging above it, a low curved lounge sofa in soft beige fabric and a glowing globe floor lamp, polished stone floor reflecting the lights. Tall dark windows on the side with palm silhouettes and the night outside. Lit only by warm artificial lighting: soft pools of light and deep shadows, no daylight. Eye-level view, calm and elegant, no people. High-end interior photography, realistic textures, no text, no watermark. Portrait 3:4.
```

### A5. Bonus — la miniature « Esquisse » du menu Ambiance

La miniature actuelle est correcte (880 × 1173). Si tu veux la refaire en plus grand, avec un rendu qui colle exactement au prompt de l'ambiance (C5) :

```
A clean architectural presentation diagram of a contemporary three-storey house with a roof garden: an all-white matte 3D massing model seen from a high axonometric angle, crisp edges, soft ambient-occlusion shadows, on a very light grey ground. The street, the plot and the neighbouring plots in the same white and light grey, a few simple white trees, a slender palm tree and tiny white human figures to scale. A touch of warm terracotta on the ground-floor wall. Thin black arrows with short labels in a clean sans-serif font: "MAIN ENTRANCE", "CAR ENTRANCE", "BACK YARD ENTRANCE", "ROOF GARDEN", and "STREET ACCESS" written along the street. No photorealistic materials or textures. Every label crisp, legible and spelled correctly, each word written once. Portrait 3:4.
```

---

## B. Comment un prompt est assemblé

Quand l'utilisateur clique sur Générer, le moteur reçoit **un seul texte**, construit dans cet ordre (`frontend/src/lib/server/generation/build-prompt.ts`) :

1. **La fiche matériaux** du projet, si elle existe déjà :
   ```
   Keep these materials consistent with the source photo:
   - facade_principale: Enduit blanc taloché
   - toiture: Tuile terre cuite
   ```
   Les lignes viennent de la détection automatique (partie G) ou de ce que l'utilisateur a corrigé.
2. **Le prompt de l'ambiance** choisie dans le menu (partie C), ou le prompt « Sans ambiance » si rien n'est choisi.
   Exception : quand la génération part d'un **modèle de l'éventail**, aucune ambiance n'est ajoutée : le prompt du modèle dit déjà tout.
3. **Le texte libre** que l'utilisateur a tapé dans la barre (ou le prompt du modèle, qu'il a pu modifier).

Le moteur reçoit aussi l'image de l'utilisateur, le format (ratio) et la taille (1K, 2K, 4K).

---

## C. Le menu Ambiance de la barre de commande

Fichier : `frontend/src/lib/server/generation/presets.ts`. Ces prompts sont invisibles pour l'utilisateur : il choisit une image dans le menu, le prompt part avec sa demande.

### C0. Sans ambiance (choix par défaut)

Un rendu photo fidèle à l'image envoyée. Repris du prompt « rendu depuis un logiciel 3D » de l'article aifordesigners : la géométrie est déjà juste, le moteur ajoute la lumière et la matière, pas ses idées.

```
Create a photorealistic architectural photograph of the attached image. Keep the exact point of view and the exact proportions. Do not alter the building shape, the openings, the architectural details or the materials shown; match every material exactly. Natural, believable light and real-world textures.
```

### C1. Plan 3D aménagé

Transforme un plan 2D en plan meublé vu du dessus. Pas de texte, pour ne pas avoir de noms de pièces mal écrits.

```
Turn the attached 2D floor plan into a photorealistic top-down 3D render of the furnished home, seen from directly above with the roof removed. Keep exactly the walls, doors, windows and room layout of the plan. Furnish every room in a warm, premium contemporary style: herringbone oak floors, a bedroom with a made bed and bedside lamps, a bathroom with a walk-in shower and a vanity, a kitchen with worktops, a dining table, a living room with a sofa, an armchair and a rug. Soft natural light with gentle shadows and warm accent lighting. Add three or four people seen from above, to scale and naturally placed. Walls cut and shown in solid black. No text, no labels, no dimensions, no room names.
```

### C2. Axonométrie éclatée

Le bâtiment séparé couche par couche en vraie 3D, avec une étiquette par couche.

```
Turn the building in the attached image into a highly detailed exploded axonometric 3D illustration: a realistic 3D model, not a flat drawing, seen from a high 30-degree angle on a clean white background. Pull the building apart vertically into its construction layers, stacked one above another with even gaps and thin dashed alignment lines between them, from bottom to top: foundations and ground slab, structural frame (columns and beams), each floor slab with its interior walls, stairs and furniture, insulation, facade cladding, windows and glazing, roof structure, roof covering. Keep the building's real shape, proportions, materials and colours, rendered realistically with soft shadows and ambient occlusion. Add clean architectural labels: thin black leader lines from each layer to a short uppercase label in a clean sans-serif font, aligned in a neat column on the right (for example ROOF, ROOF STRUCTURE, GLAZING, CLADDING, INSULATION, FIRST FLOOR, GROUND FLOOR, STRUCTURAL FRAME, FOUNDATIONS). Every label crisp, legible and spelled correctly, each word written once. High-end technical cutaway illustration style.
```

### C3. Planche d'analyse

Une planche de concours complète à partir du bâtiment de l'utilisateur.

```
Create an architecture concept analysis board of the building in the attached image, on a clean white background, in the style of an international architecture competition presentation. Precise grid layout with generous white space: a bold title CONCEPT ANALYSIS with the project's name under it; a large realistic 3D view of the building; its characteristic floor plan in fine black linework labelled FLOOR PLAN, with a north arrow and a scale bar; a long section through the building and the ground labelled SECTION; a row of five small white 3D massing models showing step by step how the form evolved, each numbered with a one-word caption; a strip of five square samples of the building's real materials, each with a small label. Thin hairline dividers and a few small annotations with arrows. All text crisp, legible and spelled correctly in a clean sans-serif font. Muted palette: white, light grey, concrete, warm wood, one soft accent colour. Professional, print-ready.
```

### C4. Maquette isométrique

Le projet en maquette de concours : bois clair, béton, verre dépoli, petits personnages blancs.

```
Turn the project in the attached image into a clean isometric 3D architectural model, seen from a high 30-degree isometric angle on a very light grey ground crossed by subtle dotted halftone bands. Keep the building's real volumes, layout, stairs and terraces. Render it like a high-end physical competition model: light birch and pine timber for the structure and slats, smooth pale grey concrete for plinths, walkways and stairs, frosted white glass for roofs and glazing, crisp edges. About fifteen tiny white abstract human figures walking and standing, to scale. Soft even daylight from the top left, gentle ambient occlusion and soft shadows. Muted palette of warm wood, white and light grey only. No trees, no background scenery, no text.
```

### C5. Esquisse

Le schéma blanc légendé que montre sa miniature (avant le 10 octobre, c'était un croquis au crayon qui ne ressemblait pas à l'image).

```
Render the building in the attached image as a clean architectural presentation diagram: an all-white matte 3D massing model seen from a high axonometric angle, crisp edges, soft ambient-occlusion shadows, on a very light grey ground. Keep the building's real shape, openings, terraces and roof. Show the site in the same white and light grey: the street, the plot, a few simple trees and tiny white human figures to scale. Add thin black arrows with short labels in a clean sans-serif font pointing to the entrances and the main outdoor spaces (for example MAIN ENTRANCE, CAR ENTRANCE, BACK YARD, ROOF GARDEN), and STREET ACCESS written along the street. No photorealistic materials or textures, no colours except a touch of warm wood or terracotta on the ground floor. Every label crisp, legible and spelled correctly.
```

### C6. Les 4 anciennes ambiances (gardées en coulisses)

Elles ne sont plus dans le menu, mais restent pour les rendus faits avec elles : quand on retouche un de ces rendus (Ajouter), son ambiance est réappliquée pour garder la même lumière.

- **Jour extérieur** : `Render in full daylight: natural sunlight, crisp cast shadows, clear sky, exterior viewpoint.`
- **Jour intérieur** : `Render an interior viewpoint lit by natural daylight through the windows, soft ambient fill, no artificial lighting.`
- **Nuit extérieur** : `Render at night, exterior viewpoint: controlled architectural lighting (facade spotlights, warm window glow), dark sky, no direct sunlight.`
- **Nuit intérieur** : `Render an interior viewpoint at night: warm artificial lighting (ceiling fixtures, lamps), dark windows, no daylight.`

**Règle des retouches :** les ambiances C1 à C4 sont des *transformations*. Elles ne sont jamais réappliquées pendant une retouche, sinon le moteur transformerait une deuxième fois son propre résultat (un plan 3D du plan 3D). L'Esquisse et les 4 lumières, elles, sont réappliquées.

---

## D. Les modèles de l'éventail (« Utiliser ce modèle »)

Fichier : `frontend/src/lib/server/generation/templates.ts`. Au clic, le prompt s'écrit dans la barre de commande, **dans la langue de l'interface**, et l'utilisateur peut le modifier avant d'envoyer. Il joint ensuite sa photo, son croquis ou sa vue 3D avec le trombone. Aucune ambiance n'est ajoutée.

Ils reprennent trois idées de l'article aifordesigners : garder exactement le point de vue, les proportions et les matériaux (n° 5) ; changer seulement la lumière (n° 8) ; ajouter quelques objets pour que l'espace paraisse habité (n° 4).

### D1. Jour extérieur

EN :
```
Create a photorealistic exterior photograph of the building in the attached image, in full daylight: natural sunlight, crisp cast shadows, clear blue sky. Keep the exact point of view and the exact proportions. Do not alter the building shape, openings, architectural details or materials; match every material exactly. Bring the site to life: mature trees and planting, a few people walking, to scale, soft reflections in the glazing. High-end architectural photography.
```
FR :
```
Créez une photographie extérieure photoréaliste du bâtiment de l'image jointe, en plein jour : soleil naturel, ombres portées nettes, ciel bleu dégagé. Gardez exactement le point de vue et les proportions. Ne modifiez ni la forme du bâtiment, ni ses ouvertures, ni ses détails d'architecture, ni ses matériaux ; respectez chaque matériau à l'identique. Donnez vie au site : arbres et plantations, quelques personnes qui marchent, à l'échelle, de légers reflets dans les vitrages. Photographie d'architecture haut de gamme.
```

### D2. Jour intérieur

EN :
```
Create a photorealistic interior photograph of the space in the attached image, lit by natural daylight through the windows: soft ambient light, gentle shadows, no artificial lighting. Keep the exact point of view, the proportions, the walls, the openings and the materials. Keep the existing furniture; if the room is empty, furnish it in a warm contemporary style. Add a few objects so the space feels lived-in: a throw on the sofa, books, a plant, a vase. High-end interior photography.
```
FR :
```
Créez une photographie intérieure photoréaliste de l'espace de l'image jointe, éclairé par la lumière du jour qui entre par les fenêtres : lumière douce, ombres légères, aucun éclairage artificiel. Gardez exactement le point de vue, les proportions, les murs, les ouvertures et les matériaux. Gardez le mobilier existant ; si la pièce est vide, meublez-la dans un style contemporain chaleureux. Ajoutez quelques objets pour que l'espace paraisse habité : un plaid sur le canapé, des livres, une plante, un vase. Photographie d'intérieur haut de gamme.
```

### D3. Nuit extérieur

EN :
```
Create a photorealistic exterior photograph of the building in the attached image at night: deep blue night sky, no sunlight, warm light glowing from every window, controlled architectural lighting with facade uplights and soft path lights, warm reflections on the ground. Keep the exact point of view and the exact proportions. Do not alter the building shape, openings, architectural details or materials. A few people to scale, planting softly lit. High-end architectural night photography.
```
FR :
```
Créez une photographie extérieure photoréaliste du bâtiment de l'image jointe, de nuit : ciel bleu nuit profond, aucun soleil, lumière chaude à chaque fenêtre, éclairage architectural maîtrisé avec des projecteurs en pied de façade et de petites bornes le long des allées, reflets chauds au sol. Gardez exactement le point de vue et les proportions. Ne modifiez ni la forme du bâtiment, ni ses ouvertures, ni ses détails d'architecture, ni ses matériaux. Quelques personnes à l'échelle, une végétation doucement éclairée. Photographie d'architecture de nuit haut de gamme.
```

### D4. Nuit intérieur

EN :
```
Create a photorealistic interior photograph of the space in the attached image at night: warm artificial lighting only (pendant lights, lamps, concealed LED strips), soft pools of light and deep shadows, dark windows with the night outside, no daylight. Keep the exact point of view, the proportions, the walls, the openings and the materials. Keep the existing furniture; if the room is empty, furnish it in a warm contemporary style, with a few objects so it feels lived-in. Cosy, high-end interior photography.
```
FR :
```
Créez une photographie intérieure photoréaliste de l'espace de l'image jointe, de nuit : uniquement un éclairage artificiel chaud (suspensions, lampes, rubans LED dissimulés), des halos de lumière doux et des ombres profondes, des fenêtres sombres sur la nuit, aucune lumière du jour. Gardez exactement le point de vue, les proportions, les murs, les ouvertures et les matériaux. Gardez le mobilier existant ; si la pièce est vide, meublez-la dans un style contemporain chaleureux, avec quelques objets pour qu'elle paraisse habitée. Photographie d'intérieur chaleureuse et haut de gamme.
```

---

## E. Commenter et Ajouter (retouches)

Fichiers : `frontend/src/lib/server/generation/annotations.ts` et `frontend/src/app/api/projects/[projectId]/edit/route.ts`.

### E1. Commenter (épingles sur l'image)

Toujours sur Pixel IA. Le moteur reçoit l'image, une copie avec les épingles numérotées dessinées dessus, et ce texte assemblé :

```
Edit this architectural render with the following localized changes ONLY.
The second attached image is the same picture with numbered markers drawn on it: each number shows exactly where the matching change applies. Do not reproduce the markers in the result.
Keep everything else identical to the first image: composition, camera, framing, geometry, lighting and every material not mentioned.
1. At 42% from the left, 63% from the top (the bottom-center): <commentaire de l'épingle 1>
2. At …: <commentaire de l'épingle 2>
Overall note: <texte de la barre, s'il y en a>
```

Les lignes numérotées sont générées automatiquement (une par épingle, 8 au maximum) ; seuls les commentaires viennent de l'utilisateur. La fiche matériaux et l'ambiance ne sont pas ajoutées, parce qu'un commentaire demande souvent justement de changer un matériau.

### E2. Ajouter (un élément avec sa photo)

Le moteur reçoit l'image, la photo de l'élément, et :

```
Add the following element into the scene, using the attached reference image for its appearance: <description de l'utilisateur>
Keep everything else in the image exactly as it is: framing, light, materials.
```

Si l'image retouchée a été faite avec une ambiance réappliquable (partie C6 et l'Esquisse), la deuxième ligne est remplacée par l'assemblage de la partie B (fiche matériaux + ambiance + la phrase « Add the following element… »).

(Une ancienne « retouche de zone » existe encore dans le code — `Modify ONLY <zone> of the image, and preserve everything else pixel-identical to the source.` — mais plus aucun bouton ne l'utilise.)

---

## F. Améliorer

Fichier : `frontend/src/lib/server/generation/enhance.ts`. Le texte envoyé est assemblé dans cet ordre : la base, une phrase par case cochée, les phrases de références (si des images de référence sont jointes), l'intensité, puis la description de l'utilisateur.

### F0. Base (toujours envoyée)
```
Enhance this architectural render. Keep the exact same composition, camera angle, framing, geometry, proportions, design and colours — do not add, remove or move any building element.
```

### F1 à F7. Les 7 cases à cocher

| Repère | Case | Prompt envoyé | Si une image de référence est jointe : « Image N is a reference for… » |
|---|---|---|---|
| F1 | Netteté | `Increase sharpness: crisp edges and clean lines, remove noise, blur and compression artefacts.` | the level of sharpness and clarity |
| F2 | Détail | `Add fine detail: high-resolution textures and legible small elements (joints, frames, fixtures), without inventing new building elements.` | the amount and kind of fine detail |
| F3 | Lumière | `Improve the lighting while keeping its direction and time of day: physically plausible shadows, soft global illumination, natural reflections and balanced exposure.` | the lighting mood, its warmth and contrast |
| F4 | Matériaux | `Make every material more photorealistic without changing what it is: believable texture, grain, roughness and reflectivity for each surface.` | the look of the materials and finishes (texture, grain, colour, reflectivity) |
| F5 | Ciel | `Replace a flat or empty sky with a natural, realistic one matching the existing light.` | the sky |
| F6 | Végétation | `Make the existing vegetation lush and realistic — plants, trees, lawns — without hiding the architecture.` | the planting: species, density and colour |
| F7 | Vie et ambiance | `Add subtle signs of life at a believable scale — a few discreet people, small everyday details — without hiding the architecture.` | the atmosphere and the kind of life in the scene |

Quand au moins une référence est jointe, cette phrase est ajoutée avant elles :
```
The first image is the render to enhance. The other images are references only: use each one solely as a guide for the aspect named below, and never copy its building, composition or camera.
```

### F8 et F9. L'intensité
- **Léger** (« Même image, plus propre ») : `Apply the improvements subtly: the result must read as the same image, only cleaner.`
- **Marqué** (« Rendu photo haut de gamme ») : `Apply the improvements clearly, aiming for a high-end photorealistic architectural visualisation, while still preserving the design exactly.`

---

## G. Les prompts qui ne fabriquent pas d'image

### G1. Détection des matériaux (fiche matériaux)

Fichier : `frontend/src/lib/server/ai/vision-materials.ts`. Lancé sur chaque image importée ou générée, il remplit la fiche matériaux de la colonne de droite. **La réponse doit rester un tableau JSON exactement dans ce format**, sinon le code ne peut pas la lire : on peut changer la consigne, pas le format.

```
Analyse cette photo de bâtiment (architecture). Identifie les matériaux visibles par face/élément (ex: "facade_principale", "facade_arriere", "toiture", "menuiseries", "sol"). Réponds UNIQUEMENT avec un tableau JSON strict, sans texte autour, au format exact :
[{"face": "facade_principale", "valeur": "Enduit blanc taloché", "confidence": 94}, ...]
"confidence" est un entier de 0 à 100 représentant ta certitude sur cette détection. N'invente pas de face que tu ne peux pas voir clairement.
```

### G2. L'assistant (deux modes)

Fichier : `frontend/src/lib/server/assistant/knowledge.ts`.

- **Mode RenderBox** : le prompt contient toute la documentation de l'application (pages, boutons, ambiances, modèles, formules et quotas, formats…), **générée automatiquement à partir du code** : quand une ambiance ou un prix change, l'assistant le sait sans qu'on réécrive rien. Règles : répondre seulement d'après cette documentation, être concret avec le nom exact des boutons, vouvoyer, proposer le mode Recherche si la question sort de RenderBox.
- **Mode Recherche** : assistant d'architecture avec accès à Internet (matériaux, styles, éclairage, végétation, références). Règles : citer ses sources, signaler ce qui est approximatif, être concis, ne jamais citer de fournisseur d'IA (les moteurs s'appellent Visio et Pixel IA).

Si une réponse de l'assistant n'arrive pas (moteur indisponible), une réponse de secours par mots-clés est utilisée (`frontend/src/lib/server/assistant/fallback.ts`).

---

## H. Ce qui a été repris de l'article aifordesigners (« 10 Best Nano Banana 2 prompts »)

| N° | Prompt de l'article | Repris ? |
|---|---|---|
| 1 | Créer un intérieur d'après une photo de référence | Non : sort de notre usage (on part de l'image du client) |
| 2 | Vider une pièce | Non pour l'instant ; idée possible d'ambiance ou de bouton à part |
| 3 | Remplacer le mobilier par un moodboard | Déjà couvert par **Ajouter** |
| 4 | Mettre un moodboard dans une pièce + « objets pour que l'espace vive » | **Oui** : la phrase « lived-in » des modèles D2 et D4 |
| 5 | Rendu photo depuis un logiciel 3D (garder point de vue, proportions, matériaux) | **Oui** : « Sans ambiance » (C0) et les 4 modèles (D) |
| 6 | Ajouter des personnes | Déjà couvert par **Ajouter** |
| 7 | Une image → grille de 4 vues | Non |
| 8 | Changer la lumière (coucher de soleil, nuit…) | **Oui** : principe des 4 modèles jour / nuit |
| 9 | Fisheye, tilt-shift, grand angle | Non |
| 10 | Agrandir en 4K | Déjà le rôle d'**Améliorer** |
