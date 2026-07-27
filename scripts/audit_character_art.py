#!/usr/bin/env python3
"""Measure visible character art and recommend UI normalization values."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "assets" / "characters"
CHARACTERS = ("quickdraw", "sheriff", "mirror", "time-freeze")
POSES = ("fullbody", "block", "reload", "fire", "power", "hit")

# Representative rendered boxes from the landscape game layout.
ROSTER_BOX = (101.0, 111.0)
FEATURE_BOX = (276.0, 612.0)
OUTCOME_BOX = (122.0, 94.0)


def metrics(path: Path) -> dict[str, float | tuple[int, int, int, int] | int]:
    with Image.open(path) as image:
        alpha = image.convert("RGBA").getchannel("A")
        bounds = alpha.getbbox()
        if bounds is None:
            raise ValueError(f"{path} has no visible pixels")
        left, top, right, bottom = bounds
        width, height = image.size
        return {
            "width": width,
            "height": height,
            "bounds": bounds,
            "visible_width": right - left,
            "visible_height": bottom - top,
            "center_x": (left + right) / 2,
        }


def visible_height_in_box(
    item: dict[str, float | tuple[int, int, int, int] | int],
    box: tuple[float, float],
) -> float:
    scale = min(
        box[0] / float(item["width"]),
        box[1] / float(item["height"]),
    )
    return float(item["visible_height"]) * scale


def rendered_axis(
    item: dict[str, float | tuple[int, int, int, int] | int],
    box: tuple[float, float],
    axis: str,
    object_position: str = "center",
) -> tuple[float, float, float]:
    width = float(item["width"])
    height = float(item["height"])
    scale = min(box[0] / width, box[1] / height)
    left, top, right, bottom = item["bounds"]
    if axis == "x":
        offset = (box[0] - width * scale) / 2
        return (
            offset + left * scale,
            offset + right * scale,
            box[0],
        )
    offset = (
        box[1] - height * scale
        if object_position == "bottom"
        else (box[1] - height * scale) / 2
    )
    return (
        offset + top * scale,
        offset + bottom * scale,
        box[1],
    )


def centered_shift_percent(
    item: dict[str, float | tuple[int, int, int, int] | int],
    box: tuple[float, float],
    css_scale: float,
    axis: str,
) -> float:
    start, end, extent = rendered_axis(item, box, axis)
    visible_center = (start + end) / 2
    transformed_center = extent / 2 + (visible_center - extent / 2) * css_scale
    return (extent / 2 - transformed_center) / extent * 100


def bottom_shift_percent(
    reference: dict[str, float | tuple[int, int, int, int] | int],
    item: dict[str, float | tuple[int, int, int, int] | int],
    box: tuple[float, float],
    css_scale: float,
) -> float:
    _, reference_bottom, extent = rendered_axis(
        reference, box, "y", object_position="bottom"
    )
    _, item_bottom, _ = rendered_axis(
        item, box, "y", object_position="bottom"
    )
    transformed_bottom = extent + (item_bottom - extent) * css_scale
    return (reference_bottom - transformed_bottom) / extent * 100


def asset(character: str, pose: str) -> Path:
    return ASSET_DIR / f"{character}-{pose}-8bit.png"


def main() -> None:
    rows: dict[str, dict[str, dict[str, float | tuple[int, int, int, int] | int]]] = {}
    for character in CHARACTERS:
        rows[character] = {}
        for pose in ("icon", *POSES):
            path = asset(character, pose)
            if path.exists():
                rows[character][pose] = metrics(path)

    reference = rows["quickdraw"]
    print("Measured alpha bounds")
    for character, character_rows in rows.items():
        print(f"\n{character}")
        for pose, item in character_rows.items():
            print(
                f"  {pose:8} "
                f"{item['width']}x{item['height']} "
                f"{item['bounds']} "
                f"{item['visible_width']}x{item['visible_height']}"
            )

    print("\nRecommended CSS")
    for character, character_rows in rows.items():
        portrait = character_rows["icon"]
        reference_portrait = reference["icon"]
        portrait_scale = visible_height_in_box(
            reference_portrait, ROSTER_BOX
        ) / visible_height_in_box(portrait, ROSTER_BOX)
        portrait_shift = centered_shift_percent(
            portrait, ROSTER_BOX, portrait_scale, "x"
        )

        fullbody = character_rows["fullbody"]
        reference_fullbody = reference["fullbody"]
        fullbody_scale = visible_height_in_box(
            reference_fullbody, FEATURE_BOX
        ) / visible_height_in_box(fullbody, FEATURE_BOX)
        fullbody_shift = centered_shift_percent(
            fullbody, FEATURE_BOX, fullbody_scale, "x"
        )
        fullbody_shift_y = centered_shift_percent(
            fullbody, FEATURE_BOX, fullbody_scale, "y"
        )

        print(f"\n{character}")
        print(f"  portrait scale={portrait_scale:.3f} shift={portrait_shift:.2f}%")
        print(
            "  fullbody "
            f"scale={fullbody_scale:.3f} "
            f"shift-x={fullbody_shift:.2f}% "
            f"shift-y={fullbody_shift_y:.2f}%"
        )
        for pose in ("fullbody", "block", "reload", "fire", "power", "hit"):
            item = character_rows[pose]
            reference_item = reference[pose]
            scale = visible_height_in_box(
                reference_item, OUTCOME_BOX
            ) / visible_height_in_box(item, OUTCOME_BOX)
            shift_y = bottom_shift_percent(
                reference_item, item, OUTCOME_BOX, scale
            )
            print(
                f"  {pose:8} "
                f"outcome-scale={scale:.3f} "
                f"shift-y={shift_y:.2f}%"
            )


if __name__ == "__main__":
    main()
