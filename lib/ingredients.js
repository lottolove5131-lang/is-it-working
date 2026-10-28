const CONCERNS = {
  acne: { label: 'Breakouts', api: 'acne' },
  redness: { label: 'Redness', api: 'redness' },
  pore: { label: 'Pores', api: 'pore' },
  age_spot: { label: 'Dark spots', api: 'age_spot' },
  texture: { label: 'Texture', api: 'texture' },
  oiliness: { label: 'Oiliness', api: 'oiliness' },
  radiance: { label: 'Radiance', api: 'radiance' },
  moisture: { label: 'Hydration', api: 'moisture' },
  wrinkle: { label: 'Fine lines', api: 'wrinkle' },
  dark_circle_v2: { label: 'Dark circles', api: 'dark_circle_v2' },
  eye_bag: { label: 'Eye bags', api: 'eye_bag' },
  firmness: { label: 'Firmness', api: 'firmness' },
  tear_trough: { label: 'Tear trough', api: 'tear_trough' },
  droopy_upper_eyelid: { label: 'Upper eyelid', api: 'droopy_upper_eyelid' },
  droopy_lower_eyelid: { label: 'Lower eyelid', api: 'droopy_lower_eyelid' }
};

const SIMULATION_PARAM = {
  acne: 'acne', redness: 'redness', pore: 'pores', age_spot: 'spots', texture: 'texture',
  radiance: 'radiance', wrinkle: 'wrinkle', dark_circle_v2: 'dark_circle', eye_bag: 'eye_bags'
};

const WATCH_FOR_IRRITATION = ['acne', 'redness', 'texture'];

const INGREDIENTS = [
  { id: 'azelaic', name: 'Azelaic acid', targets: ['acne', 'redness', 'age_spot'], window: [28, 56] },
  { id: 'niacinamide', name: 'Niacinamide', targets: ['pore', 'age_spot', 'oiliness'], window: [28, 56] },
  { id: 'salicylic', name: 'Salicylic acid (BHA)', targets: ['acne', 'pore', 'oiliness'], window: [28, 42] },
  { id: 'benzoyl', name: 'Benzoyl peroxide', targets: ['acne'], window: [28, 42] },
  { id: 'retinol', name: 'Retinol / retinoid', targets: ['wrinkle', 'texture', 'acne'], window: [56, 84] },
  { id: 'vitc', name: 'Vitamin C', targets: ['radiance', 'age_spot'], window: [28, 56] },
  { id: 'tranexamic', name: 'Tranexamic acid', targets: ['age_spot'], window: [56, 84] },
  { id: 'glycolic', name: 'Glycolic acid (AHA)', targets: ['texture', 'radiance', 'age_spot'], window: [28, 42] },
  { id: 'hyaluronic', name: 'Hyaluronic acid', targets: ['moisture'], window: [7, 14] },
  { id: 'ceramide', name: 'Ceramides', targets: ['moisture', 'redness'], window: [14, 28] },
  { id: 'centella', name: 'Centella asiatica', targets: ['redness'], window: [14, 28] },
  { id: 'caffeine', name: 'Caffeine eye serum', targets: ['eye_bag', 'dark_circle_v2'], window: [28, 56] },
  { id: 'other', name: 'Something else', targets: [], window: [28, 56] }
];

module.exports = { CONCERNS, SIMULATION_PARAM, WATCH_FOR_IRRITATION, INGREDIENTS };
