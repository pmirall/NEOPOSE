# Head references

The heads in `app/heads/` are our own: `head.py` builds them from measures, `bake.py` turns them into the app's format.
No outside mesh or image goes into them. The references below were only looked at and measured; none of their pictures
is kept in the repository.

## Sources

- **Skulls.** Animal Diversity Web (University of Michigan Museum of Zoology), specimen photographs in lateral,
  dorsal and anterior views. Species: *Canis lupus*, *Canis latrans*, *Vulpes vulpes*, *Crocuta crocuta*,
  *Felis catus*, *Panthera leo*, *Panthera tigris*, *Ursus arctos*, *Ursus americanus*, *Procyon lotor*,
  *Ailurus fulgens*, *Mephitis mephitis*, *Oryctolagus cuniculus*, *Lepus americanus*, *Capra hircus*.
- **Live animals.** Animal Diversity Web photo galleries for the same species, plus *Equus caballus*,
  *Odocoileus virginianus* and the domestic dog: heads in profile, three-quarter and front views, for the soft
  parts the skull doesn't show (fur, nose leather, lips, ears).
- **Stylised busts.** Professional anthro sculpts (canids, felids, a rabbit, dragons), looked at in public previews
  for how a stylised head is built, not copied:
  - heavy brow ridges that stand out of the forehead and overhang the eyes, with a furrow between them;
  - almond eyes under a heavy upper lid, held in the flesh of the face;
  - the muzzle a box with a flat bridge and full upper lips that overhang a narrower lower jaw;
  - a big nose leather with comma nostrils;
  - cheek fur in a few big flame-shaped tufts, flaring out behind the jaw;
  - thick ears with a deep cup and a rim;
  - planes that meet in creases rather than blobs.
- **Construction.** Furry and animal drawing practice:
  - the braincase drawn as a ball and the muzzle as a box set on its lower front;
  - the eye at the meeting of the two;
  - ears on the top corners of the skull;
  - cheek fur swept back from behind the jaw's corner.

## Measures

All measures are in head heights, from the top of the skull (not counting the ears) to the bottom of the jaw, with
the origin halfway between the eyes.

| Animal | Crown above the eye | Jaw below the eye | Nose tip ahead of the eye | Ear height |
|---|---|---|---|---|
| Coyote (profile photo) | 0.36 | 0.64 | 0.65 | ≈ 0.5 |
| Red fox (profile photo) | ≈ 0.45 | ≈ 0.55 | 0.6 | big |
| Wolf (front and three-quarter photos) | — | — | — | — |

The wolf photos give no profile figures, only proportions:
- the eyes are about a third of the head's width apart;
- the cheeks with their fur are the widest part.

The profile figures above were then turned into anthro heads with the usual stylisation:
- the braincase is a little higher, which puts the crown at 0.44–0.46;
- the muzzle is a little shorter;
- the eyes are a little bigger.

The previous heads, downloaded meshes now removed, had their crown at 0.56 above the eyes and the nose only 0.39 ahead.
Fitted on a body, they read as helmets with a small face.

### Per family

Each family's animal head, as the generator first builds it (the stylisation below then reshapes it):

| Family | Crown | Nose ahead of the eye | Features |
|---|---|---|---|
| Canids | 0.45 | 0.58 (wolf), shorter on a dog, longer on a fox | Muzzle a third of the head wide at its base, upper lips overhanging the jaw; brow ridges; four tufts of cheek fur; tall cupped ears |
| Cat | 0.47 | 0.3 | Whisker pads either side of a split lip; a small triangular nose; big eyes held in the face; big ears on the top corners |
| Big cats | 0.45 | 0.47 (tiger), longer on a lion, shorter on a snow leopard | A broad deep muzzle with big whisker pads, a broad nose, a strong chin; small round ears |
| Bear | 0.45 | 0.52 | Steep forehead (the dished profile); small round ears set wide; small eyes looking forward |
| Raccoon, red panda, skunk | 0.45 | 0.5 | Broad cheeks with fur flaring out; a narrow pointed muzzle (shorter on the red panda); round ears |
| Rabbit | 0.43 | 0.38 | An egg-shaped head, the nose line convex; full cheeks; eyes on the sides (looking 32° out); ears 0.85 tall |
| Goat, deer | 0.44 | 0.74 | Eyes to the sides (27°, drawn rounder than the animal's 32–36° so they read from the front) under a heavy lid; a soft muzzle with comma nostrils and a split lip; ears held out sideways, a deer's broad and oval, with a tear pit in front of each eye; the goat's horns sweep back and a goatee hangs from its chin |
| Horse | 0.38 | 1.0 | A soft muzzle, round in profile, with big comma nostrils on its front corners in a flared rim; the facial crest running forward under the eye; a deep round jaw (the masseter) at the back of the cheek; big eyes under a strong brow; a forelock between the ears |
| Dragon | 0.44 | 0.75 | Box-section snout with raised nostrils; heavy brow ridges; horns swept back; frills behind the jaw |
| Kemono fox | 0.55 | 0.35 | Big round skull; big eyes held in the face |

### Stylised

Fitted on a body, the animal heads still read as animals' heads on a person: a long, boxy snout in front of a small
braincase, with small eyes. So every head but the kemono fox is then turned into a character's head (`stylise` in
`head.py`), the way anthro artists and VRChat-style avatar makers proportion one:
- the braincase is a big ball, its front a broad face plane;
- the eyes are set flush in that plane, big and looking to the front (a prey animal's a little further out), under a
  soft brow;
- the animal's snout springs from the plane's lower middle and is shortened, each family by its own amount
  (`FAM_STYLE`);
- the ears, cheek fur and horns move onto the bigger ball, and the ears grow a little.

Each family keeps its own muzzle sections, jaw, nose, pads, fur and ears. Measured on the baked heads:

| Family | Crown | Nose ahead of the eye | Eye radius |
|---|---|---|---|
| Canids, raccoons | 0.45 → 0.52 | 0.53–0.62 → 0.40–0.44 | 0.10–0.11 → 0.13 |
| Cat | 0.46 → 0.53 | 0.29 → 0.26 | 0.12 → 0.13 |
| Big cats | 0.45 → 0.51 | 0.41 → 0.30–0.31 | 0.09–0.10 → 0.13 |
| Bear | 0.45 → 0.51 | 0.49 → 0.42 | 0.08 → 0.13 |
| Rabbit | 0.43 → 0.52 | 0.38 → 0.27 | 0.13 |
| Goat, deer | 0.44 → 0.49 | 0.66–0.70 → 0.54–0.59 | 0.11 → 0.14 |
| Horse | 0.40 → 0.44 | 0.83 → 0.69 | 0.10 → 0.13 |
| Dragon | 0.44 → 0.50 | 0.75 → 0.53 | 0.10 → 0.14 |
