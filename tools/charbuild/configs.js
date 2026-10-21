// Character roster baked from humanforge (MakeHuman CC0) assets.
// recolor: [{ h: centerHue(0-360), r: hueRange, to: newHue, s: satMul, l: lightMul, minS }]
const M = (o) => ({ gender: 1, eyebrows: 'eyebrow001', eyebrowColor: '#2b2018', ...o });
const F = (o) => ({ gender: 0, eyebrows: 'eyebrow002', eyebrowColor: '#3b2a1e', ...o });
export const ROSTER = [
  { id: 'player', tex: 1024, tips: true, cfg: M({ skin: 'young_caucasian_male2', caucasian: 0.55, asian: 0.35, african: 0.1, muscle: 0.62, height: 0.56, weight: 0.45, age: 0.22, hair: 'short04', hairColor: '#1d1612', eyes: 'brown', clothes: ['male_casualsuit05', 'shoes02'] }) },
  { id: 'm_denim', cfg: M({ skin: 'young_african_male', african: 0.9, asian: 0.05, caucasian: 0.05, hair: 'short01', hairColor: '#120d0a', clothes: ['male_casualsuit01', 'shoes03'] }) },
  { id: 'm_stripes', cfg: M({ skin: 'young_asian_male', asian: 0.9, african: 0.05, caucasian: 0.05, hair: 'short03', hairColor: '#120e0c', weight: 0.4, clothes: ['male_casualsuit03', 'shoes01'] }) },
  { id: 'm_whitetee', cfg: M({ skin: 'young_caucasian_male', caucasian: 0.9, asian: 0.05, african: 0.05, hair: 'short02', hairColor: '#8a6a3c', muscle: 0.55, clothes: ['male_casualsuit06', 'shoes04'] }) },
  { id: 'm_jacket_brown', cfg: M({ skin: 'middleage_caucasian_male', age: 0.5, caucasian: 0.9, asian: 0.05, african: 0.05, weight: 0.6, hair: 'short04', hairColor: '#5a5550', clothes: ['male_casualsuit05', 'shoes02'] }),
    recolor: [{ h: 90, r: 70, to: 25, s: 1.3, l: 0.9, minS: 0.0 }] },
  { id: 'm_suit', cfg: M({ skin: 'middleage_asian_male', age: 0.45, asian: 0.85, caucasian: 0.1, african: 0.05, hair: 'short04', hairColor: '#151210', clothes: ['male_elegantsuit01', 'shoes02'] }) },
  { id: 'm_overalls', cfg: M({ skin: 'middleage_african_male', age: 0.45, african: 0.85, caucasian: 0.1, asian: 0.05, weight: 0.65, muscle: 0.6, hair: 'short01', hairColor: '#1a1410', clothes: ['male_worksuit01', 'shoes03'] }) },
  { id: 'm_redtee', cfg: M({ skin: 'young_asian_male', asian: 0.8, caucasian: 0.15, african: 0.05, hair: 'short02', hairColor: '#1a1410', clothes: ['male_casualsuit04', 'shoes05'] }),
    recolor: [{ erase: [0.47, 0.07, 0.64, 0.29], sample: [0.4, 0.2] }, { rect: [0, 0, 1, 0.44], to: 355, s: 0.95, l: 0.85, minS: 0.2 }] },
  { id: 'm_old', cfg: M({ skin: 'old_caucasian_male', age: 0.85, caucasian: 0.9, asian: 0.05, african: 0.05, weight: 0.62, hair: 'short04', hairColor: '#c9c5bd', clothes: ['male_casualsuit03', 'shoes06'] }),
    recolor: [{ h: 0, r: 40, to: 210, s: 0.6, l: 1.0, minS: 0.15 }] },
  { id: 'f_greentee', cfg: F({ skin: 'young_caucasian_female', caucasian: 0.9, asian: 0.05, african: 0.05, hair: 'long01', hairColor: '#4a2f1d', clothes: ['female_casualsuit01', 'shoes01'] }),
    recolor: [{ erase: [0.69, 0.2, 0.9, 0.45], sample: [0.85, 0.12] }, { rect: [0, 0, 1, 0.5], to: 150, s: 0.55, l: 0.9, minS: 0.25 }, { rect: [0.7, 0.55, 1, 0.92], to: 150, s: 0.55, l: 0.9, minS: 0.25 }] },
  { id: 'f_shorts', cfg: F({ skin: 'young_asian_female', asian: 0.9, caucasian: 0.05, african: 0.05, hair: 'ponytail01', hairColor: '#17110d', clothes: ['female_casualsuit02', 'shoes03'] }),
    recolor: [{ erase: [0.69, 0.17, 0.9, 0.45], sample: [0.85, 0.1] }, { rect: [0, 0, 1, 0.5], to: 42, s: 0.9, l: 1.2, minS: 0.25 }, { rect: [0.7, 0.55, 1, 0.92], to: 42, s: 0.9, l: 1.2, minS: 0.25 }] },
  { id: 'f_sport', cfg: F({ skin: 'young_african_female', african: 0.9, asian: 0.05, caucasian: 0.05, hair: 'afro01', hairColor: '#120d0a', clothes: ['female_sportsuit01', 'shoes05'] }),
    recolor: [{ rect: [0, 0, 1, 0.5], to: 320, s: 0.8, l: 1.0, minS: 0.25 }, { rect: [0.7, 0.55, 1, 0.92], to: 320, s: 0.8, l: 1.0, minS: 0.25 }] },
  { id: 'f_office', cfg: F({ skin: 'middleage_caucasian_female', age: 0.45, caucasian: 0.9, asian: 0.05, african: 0.05, hair: 'toigo_blunt_bob', hairColor: '#6b4428', clothes: ['female_elegantsuit01', 'shoes02'] }) },
  { id: 'f_trousersuit', cfg: F({ skin: 'young_asian_female', asian: 0.85, caucasian: 0.1, african: 0.05, hair: 'rehmanpolanski_hair_bun_brown', hairColor: '#1d1410', clothes: ['toigo_female_suit_2', 'shoes02'] }),
    recolor: [{ h: 300, r: 45, to: 215, s: 0.3, l: 0.45, minS: 0.1 }] },
  { id: 'f_dress', cfg: F({ skin: 'young_caucasian_female2', caucasian: 0.85, asian: 0.1, african: 0.05, hair: 'toigo_curled_under_bob', hairColor: '#b88a4a', clothes: ['toigo_halter_dress_knee_length', 'shoes01'] }) },
  { id: 'f_old', cfg: F({ skin: 'old_asian_female', age: 0.85, asian: 0.9, caucasian: 0.05, african: 0.05, weight: 0.6, hair: 'bob02', hairColor: '#b9b5ae', clothes: ['female_elegantsuit01', 'shoes06'] }),
    recolor: [{ h: 0, r: 40, to: 265, s: 0.5, l: 1.1, minS: 0.15 }] },
  // gang (enemies)
  { id: 'gang_a', cfg: M({ skin: 'young_caucasian_male2', caucasian: 0.7, african: 0.2, asian: 0.1, muscle: 0.7, hair: 'short01', hairColor: '#0f0c0a', clothes: ['male_casualsuit04', 'shoes04'] }),
    recolor: [{ erase: [0.47, 0.07, 0.64, 0.29], sample: [0.4, 0.2] }, { rect: [0, 0, 1, 0.44], to: 275, s: 0.7, l: 0.5, minS: 0.2 }] },
  { id: 'gang_b', cfg: M({ skin: 'young_african_male', african: 0.85, caucasian: 0.1, asian: 0.05, muscle: 0.7, hair: 'short02', hairColor: '#0f0c0a', clothes: ['male_casualsuit05', 'shoes05'] }),
    recolor: [{ h: 90, r: 70, to: 280, s: 0.4, l: 0.35, minS: 0.0 }] },
  { id: 'gang_c', cfg: M({ skin: 'young_asian_male', asian: 0.8, caucasian: 0.15, african: 0.05, muscle: 0.65, hair: 'short04', hairColor: '#0f0c0a', clothes: ['male_casualsuit03', 'shoes01'] }),
    recolor: [{ h: 0, r: 40, to: 285, s: 1.0, l: 0.8, minS: 0.15 }] },
  // police
  { id: 'cop_m', cop: true, cfg: M({ skin: 'young_caucasian_male', caucasian: 0.75, african: 0.15, asian: 0.1, muscle: 0.65, height: 0.6, hair: 'short04', hairColor: '#2a1f17', clothes: ['male_casualsuit01', 'shoes03'] }),
    recolor: [{ h: 215, r: 60, to: 220, s: 1.0, l: 0.62, minS: 0.0 }] },
  { id: 'cop_f', cop: true, cfg: F({ skin: 'young_african_female', african: 0.8, caucasian: 0.15, asian: 0.05, muscle: 0.6, hair: 'rehmanpolanski_hair_bun_brown', hairColor: '#120d0a', clothes: ['female_casualsuit01', 'shoes03'] }),
    recolor: [{ erase: [0.69, 0.2, 0.9, 0.45], sample: [0.85, 0.12] }, { rect: [0, 0, 1, 0.5], to: 218, s: 0.85, l: 0.72, minS: 0.0 }, { rect: [0.7, 0.55, 1, 0.92], to: 218, s: 0.85, l: 0.72, minS: 0.0 }, { h: 215, r: 60, to: 222, s: 0.7, l: 0.45, minS: 0.0 }] },
];
export const CLIPS_UAL1 = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Driving_Loop', 'Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down', 'Pistol_Shoot', 'Pistol_Reload', 'Hit_Chest', 'Hit_Head', 'Death01', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Roll', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Idle_Talking_Loop', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Sitting_Enter', 'Sitting_Exit', 'Punch_Jab', 'Punch_Cross', 'Interact', 'Walk_Formal_Loop', 'Dance_Loop', 'PickUp_Table'];
export const CLIPS_UAL2 = ['Idle_TalkingPhone_Loop', 'Idle_FoldArms_Loop', 'Hit_Knockback', 'LayToIdle', 'Walk_Carry_Loop', 'Idle_No_Loop', 'Yes', 'Consume', 'Idle_Rail_Loop'];
