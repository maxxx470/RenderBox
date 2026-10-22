// Test fixtures of the analysis pipeline: the specification's own fictitious
// two-storey villa (« Exemple de sections écrites par Claude »).
import type { BuildingAnalysis, EnhanceAnalysis, PlanAnalysis } from './analyze';

export const VILLA: BuildingAnalysis = {
  status: 'ok',
  same_building: 'no',
  matched_sheet: null,
  type: 'exterior',
  building_type: 'villa',
  floors: 2,
  roof: 'flat roof with a thin overhang',
  openings: '6 windows, 1 entrance door on the ground floor, centred',
  materials: [
    { element: 'ground floor walls', material: 'white rendered walls', color: 'white' },
    { element: 'upper floor cladding', material: 'iroko timber slats', color: 'warm brown' },
    { element: 'window frames', material: 'black aluminium', color: 'black' },
  ],
  view_angle: 'three-quarter view at eye level',
  lock_summary:
    'Two-storey cubic villa, flat roof with thin overhang, entrance centred on the ground floor, three tall windows per floor.',
  look: null,
};

export const VILLA_SECTIONS = {
  site: 'Cocody, Abidjan. A quiet upscale residential street: tarred road with red laterite verges, low rendered boundary walls, mature eucalyptus trees, and simple two-storey villas set back behind gates. Distant neighbours stay soft and secondary. Humid tropical calm.',
  lighting:
    'Late-morning sun around 10 to 11 am, high and slightly angled, casting short crisp shadows from the roof overhang and tree canopies onto the facade. Clear blue sky with a few well-defined white clouds, dry-season clarity, bright and clean mood.',
  vegetation:
    'A tall eucalyptus with a slender pale trunk and airy canopy rises beside the plot; a broad round-crowned shade tree stands at the far edge. Mid layer: dense rounded ligustrum shrubs and mounds of red, white and pink flowering shrubs. Ground: clipped low hedge, feathery grasses, ferns, short lawn.',
};

export const BEDROOM: BuildingAnalysis = {
  ...VILLA,
  type: 'interior',
  building_type: 'bedroom of a villa',
  materials: [
    { element: 'floor', material: 'iroko wood planks', color: 'warm brown' },
    { element: 'walls', material: 'white paint', color: 'white' },
    { element: 'curtains', material: 'linen', color: 'off-white' },
  ],
  lock_summary: 'Rectangular bedroom, bed against the back wall, one large window on the left.',
};

export const BEDROOM_SECTIONS = {
  space:
    'Master bedroom of a contemporary villa in Abidjan. Calm, airy proportions with generous ceiling height and cross ventilation. Clean contemporary tropical style; the window frames a soft garden view of eucalyptus trees.',
  lighting:
    'Morning light enters softly through the openings and the linen curtains, creating gentle sunbeams across the floor and bed. No artificial light needed; soft shadows, warm neutral tones, calm and restful mood.',
  styling:
    'Furniture stays exactly as in the image. Accessories: handwoven throw, ceramic vase, wooden stool. Greenery: potted ferns and a leafy plant with palm-like fronds near the window.',
};

export const VILLA_LABELS = {
  ...VILLA,
  labels_fr: ['Toiture', 'Étage', 'Rez-de-chaussée', 'Dalle'],
};
export const VILLA_ACCESS = {
  ...VILLA,
  access_points: [
    {
      type: 'main entrance',
      location: 'centre of the ground floor',
      label_fr: 'ENTRÉE PRINCIPALE',
    },
    { type: 'garage', location: 'left side', label_fr: 'GARAGE' },
  ],
};

export const PLAN: PlanAnalysis = {
  status: 'ok',
  same_building: 'no',
  matched_sheet: null,
  rooms: [
    {
      name: 'Séjour',
      area_if_written: '32 m²',
      floor_material: 'large-format light tiles',
      key_furniture: ['sofa', 'dining table'],
    },
    { name: 'Chambre 1', floor_material: 'iroko wood', key_furniture: ['double bed'] },
  ],
  openings: '5 doors, 7 windows',
};

export const VILLA_ENHANCE: EnhanceAnalysis = {
  status: 'ok',
  same_building: 'no',
  matched_sheet: null,
  type: 'exterior',
  lock_summary: VILLA.lock_summary,
  elements: [
    {
      element: 'ground floor walls',
      current_material: 'render',
      color: 'white',
      quality_issue: 'flat and plastic',
      premium_finish: 'lime-based render, fine grain with subtle trowel marks, matte',
    },
    {
      element: 'upper floor cladding',
      current_material: 'timber slats',
      color: 'warm brown',
      quality_issue: 'repetitive texture',
      premium_finish:
        'clear-oiled iroko slats with visible grain and tight even joints, in the original wood tone',
    },
    {
      element: 'balustrade',
      current_material: 'unclear',
      color: 'grey',
      quality_issue: 'blurry',
      premium_finish: 'keep as is',
    },
  ],
  look: { recipe: 'Soft overcast daylight, muted earthy palette, gentle contrast.' },
};
