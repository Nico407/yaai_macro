#!/usr/bin/env bash
# Add the Swiss Food Composition Database (FSVO/BLV, naehrwertdaten.ch) to your ingredients: about 750 plain
# foods with macros per 100 g. Safe to run again (e.g. when a new version comes out): it updates what it added
# before, never adds a copy, and leaves ingredients you already have alone. Prints counts and names only.
#   bash ~/yaai_macro/deploy/import-swiss-foods.sh            (downloads the current file)
#   bash ~/yaai_macro/deploy/import-swiss-foods.sh file.xlsx  (use a file you downloaded yourself)
#   bash ~/yaai_macro/deploy/import-swiss-foods.sh --inspect   (show what the files and the database contain; no changes)
set -euo pipefail
cd "$(dirname "$0")/.."
# English names; the German file only adds German names for searching ("Lauch" finds leek)
URL="https://naehrwertdaten.ch/wp-content/uploads/2026/07/Swiss_food_composition_database.xlsx"
URL_DE="https://naehrwertdaten.ch/wp-content/uploads/2023/08/Schweizer_Nahrwertdatenbank.xlsx"
val() { grep -E "^$1=" .env.local 2>/dev/null | head -n1 | cut -d= -f2- | sed -E "s/^\"(.*)\"\$/\1/; s/^'(.*)'\$/\1/"; }
db=$(val MACRO_DB_URL)
[ -n "$db" ] || { echo "No MACRO_DB_URL in .env.local"; exit 1; }
bash deploy/apply-migrations.sh >/dev/null       # the source columns this needs
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
if [ -n "${1:-}" ] && [ "$1" != "--inspect" ]; then cp "$1" "$tmp/foods.xlsx"; else
  echo "==> Downloading the Swiss Food Composition Database"
  curl -fsSL --retry 2 -o "$tmp/foods.xlsx" "$URL" || { echo "Download failed. Get the Excel file from https://naehrwertdaten.ch/en/downloads/ and run: bash $0 <file.xlsx>"; exit 1; }
fi
curl -fsSL --retry 2 -o "$tmp/foods_de.xlsx" "$URL_DE" 2>/dev/null || rm -f "$tmp/foods_de.xlsx"   # optional
if [ "${1:-}" = "--inspect" ] || [ "${2:-}" = "--inspect" ]; then    # show what the files contain, change nothing
  python3 -I deploy/import_swiss_foods.py --inspect "$tmp/foods.xlsx" $( [ -f "$tmp/foods_de.xlsx" ] && echo "$tmp/foods_de.xlsx" )
  echo "In your database now:"; psql "$db" -qtAX -c "select name || '  |  ' || coalesce(name_de, '-') from public.ingredients where source = 'swiss-fcdb' order by name limit 8"
  exit 0
fi
psql "$db" -qtAX -c "select name from public.ingredients where source is distinct from 'swiss-fcdb'" > "$tmp/existing.txt"
echo "==> Reading it"
python3 -I deploy/import_swiss_foods.py "$tmp/foods.xlsx" "$tmp/existing.txt" $( [ -f "$tmp/foods_de.xlsx" ] && echo "$tmp/foods_de.xlsx" ) > "$tmp/import.sql"
psql "$db" -X -q -v ON_ERROR_STOP=1 -f "$tmp/import.sql"
echo "    Done: $(psql "$db" -qtAX -c "select count(*) from public.ingredients where source = 'swiss-fcdb'") Swiss foods, $(psql "$db" -qtAX -c "select count(*) from public.ingredients") ingredients in total."
