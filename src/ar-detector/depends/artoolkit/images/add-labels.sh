#!/bin/bash
# Marker image labelling - Dan Jackson, 2026.
#
# spell-checker:words magick

# Check if 'magick' is in path
if ! command -v magick &> /dev/null; then
  echo "ERROR: ImageMagick 'magick' command not found. On macOS, please install ImageMagick: brew install imagemagick"
  exit 1
fi

# Check exactly one argument is provided
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <directory>"
  exit 1
fi
IN_DIRECTORY="$1"
OUT_DIRECTORY="${IN_DIRECTORY}-labels"

# Check if input directory exists
if [ ! -d "$IN_DIRECTORY" ]; then
  echo "ERROR: Directory does not exist: $DIRECTORY"
  exit 1
fi

# Check if output directory already exists
if [ -d "$OUT_DIRECTORY" ]; then
  echo "ERROR: Output directory already exists: $OUT_DIRECTORY"
  exit 1
fi

EXTENSION=".png"
mkdir -p "$OUT_DIRECTORY"
for FILEPATH in "$IN_DIRECTORY"/*"$EXTENSION"; do
  FILENAME=$(basename "$FILEPATH")
  OUT_FILEPATH="$OUT_DIRECTORY/$FILENAME"
  LABEL="${FILENAME%$EXTENSION}"
  echo "Labelling: $FILEPATH"
  magick "$FILEPATH" -size %[w]x%[fx:h*0.10] -font Arial -gravity south label:"$LABEL" -append "$OUT_FILEPATH"
  if [ $? -ne 0 ]; then
    echo "ERROR: Failed to label image: $FILEPATH"
	exit 1
  fi
done

echo "Done. Labeled images are in: $OUT_DIRECTORY"
