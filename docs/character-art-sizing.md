# Character Art Sizing

Quick Draw uses transparent PNG character art in four UI locations. Every image
is placed in a shared CSS box, but transparent padding and pose width can make
two characters look different even when their image elements have identical
dimensions.

The sizing system normalizes **visible character height** while preserving pose
silhouettes. Wide actions should remain wide and upright actions should remain
narrow; they should not be stretched to equal widths.

## UI locations and targets

| Location | CSS selector | Display box | Normalization target |
| --- | --- | --- | --- |
| Roster portrait | `.character-card img` | 84% card width × 56% card height | Face and hat remain comfortably inside the wanted poster |
| Character feature | `#heroCharacterImage` | 96% stage width × 100% stage height | Full body matches the Quickdraw reference silhouette and baseline |
| Rival HUD portrait | `.rival-avatar img` | 46–68 px square | Same apparent head-and-shoulders size as the roster portrait |
| Player HUD portrait | `.you-avatar img` | 22 px square | Same portrait crop at compact scale |
| Winner portrait | `.winner-medallion img` | 58–86 px square | Same portrait crop as HUD avatars |
| Outcome pose | `.outcome-action-visual img` | 82–122 px card width; 58–94 px visual height | Match the Quickdraw reference height for the same pose |

The feature image uses a center transform origin so scaling does not pull a
fighter toward the top of the panel. Outcome images use a fixed-height visual
stage and a bottom-center transform origin so different source aspect ratios
cannot change their rendered size.

## Measured alpha bounds

Bounds are measured from pixels with non-zero alpha after final asset resizing.
Coordinates use `(left, top)–(right, bottom)`.

### Quickdraw reference

| Asset | Canvas | Visible bounds | Visible size | Canvas fill |
| --- | ---: | ---: | ---: | ---: |
| Icon | 1024×1024 | (0,22)–(1005,1024) | 1005×1002 | 98.1% × 97.9% |
| Full body / Idle | 975×1614 | (185,109)–(778,1452) | 593×1343 | 60.8% × 83.2% |
| Block | 607×768 | (113,96)–(480,674) | 367×578 | 60.5% × 75.3% |
| Reload | 559×768 | (131,38)–(427,706) | 296×668 | 53.0% × 87.0% |
| Fire | 768×768 | (148,71)–(656,668) | 508×597 | 66.1% × 77.7% |
| Power | 648×768 | (31,86)–(634,676) | 603×590 | 93.1% × 76.8% |
| Hit | 768×768 | (192,70)–(585,669) | 393×599 | 51.2% × 78.0% |

### Sheriff

| Asset | Canvas | Visible bounds | Visible size | Canvas fill |
| --- | ---: | ---: | ---: | ---: |
| Icon | 1024×1024 | (0,49)–(949,1024) | 949×975 | 92.7% × 95.2% |
| Full body / Idle | 1024×1536 | (210,91)–(763,1328) | 553×1237 | 54.0% × 80.5% |
| Block | 512×768 | (99,84)–(424,665) | 325×581 | 63.5% × 75.7% |
| Reload | 671×768 | (189,34)–(483,707) | 294×673 | 43.8% × 87.6% |
| Fire | 768×768 | (187,67)–(712,639) | 525×572 | 68.4% × 74.5% |
| Power | 512×768 | (98,90)–(412,685) | 314×595 | 61.3% × 77.5% |
| Hit | 768×768 | (152,49)–(630,679) | 478×630 | 62.2% × 82.0% |

### Mirror

| Asset | Canvas | Visible bounds | Visible size | Canvas fill |
| --- | ---: | ---: | ---: | ---: |
| Icon | 1024×1024 | (0,83)–(971,1024) | 971×941 | 94.8% × 91.9% |
| Full body / Idle | 1024×1536 | (234,100)–(776,1342) | 542×1242 | 52.9% × 80.9% |
| Block | 512×768 | (95,73)–(417,686) | 322×613 | 62.9% × 79.8% |
| Reload | 512×768 | (126,50)–(383,697) | 257×647 | 50.2% × 84.2% |
| Fire | 768×768 | (159,81)–(703,640) | 544×559 | 70.8% × 72.8% |
| Power | 511×768 | (79,54)–(414,688) | 335×634 | 65.6% × 82.6% |
| Hit | 768×768 | (167,73)–(620,676) | 453×603 | 59.0% × 78.5% |

### Time Freeze

| Asset | Canvas | Visible bounds | Visible size | Canvas fill |
| --- | ---: | ---: | ---: | ---: |
| Icon | 1024×1024 | (0,80)–(949,1024) | 949×944 | 92.7% × 92.2% |
| Full body / Idle | 1024×1536 | (278,147)–(740,1229) | 462×1082 | 45.1% × 70.4% |
| Block | 512×768 | (106,100)–(404,659) | 298×559 | 58.2% × 72.8% |
| Reload | 511×768 | (127,54)–(375,655) | 248×601 | 48.5% × 78.3% |
| Fire | 768×768 | (120,80)–(694,642) | 574×562 | 74.7% × 73.2% |
| Power | 512×768 | (120,58)–(417,689) | 297×631 | 58.0% × 82.2% |
| Hit | 768×768 | (207,89)–(588,642) | 381×553 | 49.6% × 72.0% |

## CSS correction values

Quickdraw is the `1.00` reference. Corrections are applied using
`data-character-id` and `data-pose`, so adding another character does not
require changing the shared component dimensions.

| Location or pose | Quickdraw | Sheriff | Mirror | Time Freeze |
| --- | ---: | ---: | ---: | ---: |
| Portraits | 1.000 | 1.028 | 1.065 | 1.061 |
| Selection full body | 1.000 | 1.140 | 1.136 | 1.304 |
| Outcome Idle | 1.000 | 1.033 | 1.029 | 1.181 |
| Outcome Block | 1.000 | 0.995 | 0.943 | 1.034 |
| Outcome Reload | 1.000 | 0.993 | 1.032 | 1.111 |
| Outcome Fire | 1.000 | 1.044 | 1.068 | 1.062 |
| Outcome Power | 1.000 | 0.992 | 0.931 | 0.935 |
| Outcome Hit | 1.000 | 0.951 | 0.993 | 1.083 |

Position corrections center the visible pixels rather than the transparent PNG
canvas. They also compensate for different transparent margins below boots.
Run `scripts/audit_character_art.py` after adding or replacing art to calculate
the scale and position values used by CSS.

## Adding future character art

1. Export PNGs with transparent backgrounds and no baked-in floor shadow.
2. Keep boots near a consistent bottom margin.
3. Measure the non-transparent alpha bounding box for every asset.
4. Add `data-character-id` to every rendered location through the shared game
   renderer; do not target filenames in CSS.
5. Add portrait, full-body, and per-pose scale variables relative to the
   Quickdraw reference.
6. Run `scripts/audit_character_art.py` and copy the measured scale and shift
   values into the character-specific CSS variables.
7. Verify at least roster, duel outcome, trio outcome, player HUD, rival HUD,
   and winner-medallion placements.
