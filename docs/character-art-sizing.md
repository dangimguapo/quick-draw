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
| Roster portrait | `.character-card img` | 96% card width × 64% card height | Face and hat fill the portrait area without clipping |
| Character feature | `#heroCharacterImage` | 96% stage width × 100% stage height | Full body matches the Quickdraw reference silhouette and baseline |
| Rival HUD portrait | `.rival-avatar img` | 46–68 px square | Same apparent head-and-shoulders size as the roster portrait |
| Player HUD portrait | `.you-avatar img` | 22 px square | Same portrait crop at compact scale |
| Winner portrait | `.winner-medallion img` | 58–86 px square | Same portrait crop as HUD avatars |
| Outcome pose | `.outcome-action-visual img` | 82–122 px card width; 58–94 px visual height | Match the Quickdraw reference height for the same pose |

All full-body and action images use a bottom-center transform origin so boots
stay on the same baseline when a scale correction is applied.

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

## CSS correction values

Quickdraw is the `1.00` reference. Sheriff corrections are applied using
`data-character-id` and `data-pose`, so adding another character does not require
changing the shared component dimensions.

| Location or pose | Quickdraw | Sheriff | Mirror | Reason |
| --- | ---: | ---: | ---: | --- |
| Portraits | 1.00 | 1.04 | 1.05 | Compensates for smaller portrait alpha bounds |
| Selection full body | 1.00 | 1.13 | 1.14 | Compensates for narrower full-body canvases and padding |
| Outcome Idle | 1.00 | 1.03 | 1.03 | Matches visible full-body height |
| Outcome Block | 1.00 | 1.00 | 0.94 | Mirror Block is about 6% taller |
| Outcome Reload | 1.00 | 0.99 | 1.03 | Matches visible reload height |
| Outcome Fire | 1.00 | 1.04 | 1.07 | Compensates for shorter firing silhouettes |
| Outcome Power | 1.00 | 0.99 | 0.93 | Matches height; width remains intentionally pose-specific |
| Outcome Hit | 1.00 | 0.95 | 0.99 | Matches visible recoil height |

## Adding future character art

1. Export PNGs with transparent backgrounds and no baked-in floor shadow.
2. Keep boots near a consistent bottom margin.
3. Measure the non-transparent alpha bounding box for every asset.
4. Add `data-character-id` to every rendered location through the shared game
   renderer; do not target filenames in CSS.
5. Add portrait, full-body, and per-pose scale variables relative to the
   Quickdraw reference.
6. Verify at least roster, duel outcome, trio outcome, player HUD, rival HUD,
   and winner-medallion placements.
