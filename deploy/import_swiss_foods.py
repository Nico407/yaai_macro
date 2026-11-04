#!/usr/bin/env python3
"""
Import the Swiss Food Composition Database (BLV, naehrwertdaten.ch) into the ingredients table: plain foods and
ingredients only (no ready meals, cakes, drinks or alcohol), per 100 g with fibre and salt (from sodium), and
dietary tags from the food's
category. Prints SQL for psql; run through deploy/import-swiss-foods.sh, which downloads the file and applies it.

  python3 import_swiss_foods.py <english.xlsx> <existing-names.txt> [<german.xlsx>]  > import.sql   (summary on stderr)

The English file gives the names; the German one (optional) only adds German names for searching.

No duplicates:
- each food is stored with source 'swiss-fcdb' and its ID: running again updates values, never adds a copy;
- a food whose name matches one you already have (same words, any order: "Chicken breast (raw)" = "Chicken,
  breast, raw") isn't added; yours keeps its values and only gets what it's missing (German name, fibre, salt);
- Open Food Facts products you add in the app carry source 'off' + barcode, so they can't double up either.

Reads the .xlsx with the standard library only (it's a zip of XML files), so the Pi needs nothing installed.
Source: Swiss Food Composition Database, Federal Food Safety and Veterinary Office (FSVO/BLV), naehrwertdaten.ch.
"""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
SOURCE = "swiss-fcdb"

# Categories (English, or German) left out: dishes and drinks, not ingredients
SKIP = re.compile(r"^(prepared dishes|fertiggerichte|alcoholic beverages|alkoholische getränke|savoury snacks|salzige snacks"
                  r"|sweets/(cakes|cookies|other sweet pastries|creams|candies)|süssigkeiten/(kuchen|guetzli|kekse|anderes süsses|cremen|bonbons)"
                  r"|non-alcoholic beverages/(soft drinks|coffee|tea|cocoa)|alkoholfreie getränke/(süssgetränke|kaffee|tee|kakao))", re.I)

V = ["vegan", "vegetarian", "pescatarian"]
VEG = ["vegetarian", "pescatarian"]
GLUTEN = re.compile(r"\b(wheat|spelt|rye|barley|oats?|oat flakes|bread|pasta|noodles|semolina|couscous|bulgur|seitan|"
                    r"flour|dough|pastry|crispbread|rusk|cracker|wafer|zwieback|weizen|dinkel|roggen|gerste|hafer|brot|"
                    r"teigwaren|griess|mehl|teig)\b", re.I)
GLUTEN_FREE = re.compile(r"\b(rice|corn|maize|potato|buckwheat|chestnut|chickpea|soya?|almond|coconut|reis|mais|kartoffel|"
                         r"buchweizen|kastanien|kichererbsen|gluten-?free|glutenfrei)\b", re.I)
SEEDS = re.compile(r"\b(sunflower|pumpkin|sesame|chia|lin|flax|poppy|hemp|sonnenblumen|kürbis|sesam|lein|mohn|hanf)", re.I)
NOISE = re.compile(r"\s*\((?:without|ohne|uniodised|unjodiert|with(?:out)? addition)[^)]*\)", re.I)


def tags_for(name, cat):
    c, n = cat.lower(), name.lower()
    t = []
    if c.startswith(("meat", "fleisch", "sausages", "wurst")):
        t = []
    elif c.startswith(("fish", "fisch")):
        t = ["pescatarian", "contains_shellfish" if re.search(r"seafood|crustacean|shellfish|meeresfr|krusten|muschel", c) else "contains_fish"]
    elif "milk and dairy" in c or "milch" in c or "cream and butter" in c:
        t = VEG + ["contains_lactose"]
    elif c.startswith(("eggs", "eier")):
        t = VEG + ["contains_eggs"]
    elif c.startswith(("vegetables", "gemüse", "fruit", "früchte", "obst", "nuts", "nüsse", "cereal products", "getreide",
                       "fats and oils/oils", "fette und öle/öle", "various/salt", "verschiedenes/salz", "various/gelling",
                       "verschiedenes/gelier")):
        t = list(V)
        if re.search(r"\b(egg|ei)\b|with egg|mit ei", n):
            t = VEG + ["contains_eggs"]
    elif c.startswith(("bread", "brot")):
        t = list(VEG)                       # bread often has milk or butter: vegetarian, not vegan
        if re.search(r"butter|milk|milch|zopf", n):
            t.append("contains_lactose")
    if GLUTEN.search(n) and not GLUTEN_FREE.search(n):
        t.append("contains_gluten")
    if (c.startswith(("nuts", "nüsse")) and not SEEDS.search(n)) or re.search(r"\b(almond|hazelnut|walnut|cashew|pistachio|peanut|mandel|haselnuss|baumnuss|erdnuss)", n):
        t.append("contains_nuts")
    if re.search(r"\b(soy|soja|tofu)", n):
        t.append("contains_soy")
    return sorted(set(t), key=t.index)


FILLER = {"raw", "roh", "fresh", "frisch", "natural", "nature", "plain", "average", "durchschnitt"}


def words(name):
    """The same key for names that say the same: 'Chicken, breast, raw' = 'Chicken breast (raw)', 'Egg, raw' = 'Eggs',
    'Broccoli, raw' = 'Broccoli'. Words in any order, plural s and words like raw / fresh ignored."""
    ws = {w[:-1] if len(w) > 3 and w.endswith("s") else w for w in re.findall(r"[a-zäöüàéèç0-9]+", name.lower())}
    return " ".join(sorted(ws - FILLER)) or name.lower()


def num(v):
    if v is None:
        return None
    s = str(v).strip().replace(",", ".")
    if s.startswith("<") or s.lower() in ("tr", "traces", "spuren"):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return None


# --- minimal .xlsx reading ---------------------------------------------------------------------------------------

def _col(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_sheet(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheets = [(s.get("name"), rels[s.get(f"{{{NS['r']}}}id")]) for s in wb.find("m:sheets", NS)]
    # the generic foods (not the branded products sheet, if there is one)
    name, target = next((s for s in sheets if re.search(r"generi", s[0], re.I)), sheets[0])
    target = target.lstrip("/")
    target = target if target.startswith("xl/") else "xl/" + target
    rows = []
    for row in ET.fromstring(z.read(target)).iter(f"{{{NS['m']}}}row"):
        cells = {}
        for c in row.findall("m:c", NS):
            v = c.find("m:v", NS)
            if c.get("t") == "s" and v is not None:
                val = shared[int(v.text)]
            elif c.get("t") == "inlineStr":
                val = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
            else:
                val = v.text if v is not None else None
            cells[_col(c.get("r"))] = val
        rows.append([cells.get(i) for i in range(max(cells) + 1)] if cells else [])
    return name, rows


# --- columns, found by their header (English or German) ---------------------------------------------------------

WANT = {
    "id": [r"^id$"],
    "name_en": [r"^name e$", r"^name \(?en", r"^english name", r"^name englisch"],
    "name_de": [r"^name d$", r"^name \(?de", r"^name$", r"^name deutsch"],
    "cat_en": [r"^category e$", r"^categor(y|ies) \(?en"],
    "cat_de": [r"^category d$", r"^kategorie"],
    "kcal": [r"^energy,? (kcal|kilocalories)", r"^energie,? (kcal|kalorien)", r"kcal"],
    "protein": [r"^protein", r"^eiweiss"],
    "carbs": [r"^carbohydrates?,? available", r"^kohlenhydrate,? verfügbar", r"^carbohydrates?$", r"^kohlenhydrate$"],
    "fat": [r"^fat,? total", r"^fett,? total", r"^fat$", r"^fett$"],
    "fibre": [r"^dietary fib", r"^nahrungsfasern", r"^fib(re|er)"],
    "salt": [r"^salt\b", r"^salz\b", r"nacl"],
    "sodium": [r"^sodium", r"^natrium"],
}


def _lang(heads):
    """'en', 'de' or None (multilingual): one-language files just say 'name' / 'category'."""
    if any(h.startswith("energie") or h.startswith("kategorie") for h in heads):
        return "de"
    if any(h.startswith("energy") for h in heads) and "name" in heads:
        return "en"
    return None


def find_columns(rows, need_english=True):
    for i, row in enumerate(rows[:15]):
        heads = [str(h or "").strip().lower() for h in row]
        if "id" not in heads:
            continue
        cols = {}
        for key, pats in WANT.items():
            for p in pats:
                hit = next((j for j, h in enumerate(heads) if re.search(p, h)), None)
                if hit is not None:
                    cols[key] = hit
                    break
        lang = _lang(heads)
        if lang:                                   # "name" / "synonyms" / "category" are in the file's language
            for k in ("name_en", "name_de", "cat_en", "cat_de"):
                cols.pop(k, None)
            cols[f"name_{lang}"] = heads.index("name")
            cat = next((j for j, h in enumerate(heads) if h.startswith(("category", "kategorie"))), None)
            if cat is not None:
                cols[f"cat_{lang}"] = cat
        missing = [k for k in ("id", "kcal", "protein", "carbs", "fat") if k not in cols]
        if need_english and "name_en" not in cols:  # names stay English: never fall back to the German ones
            missing.append("English names (this is the German file)" if lang == "de" else "English name column")
        if missing:
            sys.exit(f"Nothing imported. Header row found, but not these columns: {missing}\n"
                     f"Headers: {[h for h in heads if h]}\n"
                     "The English file is on https://naehrwertdaten.ch/en/downloads/ ; run:\n"
                     "  bash ~/yaai_macro/deploy/import-swiss-foods.sh <file.xlsx>")
        return i, cols
    sys.exit("No header row with an 'ID' column in the first 15 rows; the file's layout changed.")


def german_names(path):
    """ID -> German name, from the German file, for searching ('Lauch' finds leek). Optional."""
    try:
        _, rows = read_sheet(path)
        h, cols = find_columns(rows, need_english=False)
    except (SystemExit, Exception) as e:
        print(f"   (no German names: {e})", file=sys.stderr)
        return {}
    if "name_de" not in cols:
        return {}
    out = {}
    for r in rows[h + 1:]:
        fid = r[cols["id"]] if cols["id"] < len(r) else None
        de = r[cols["name_de"]] if cols["name_de"] < len(r) else None
        if fid and de:
            out[str(fid).split(".")[0]] = str(de).strip()
    return out


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main(xlsx, existing_path, xlsx_de=None):
    sheet, rows = read_sheet(xlsx)
    h, cols = find_columns(rows)
    de_by_id = german_names(xlsx_de) if xlsx_de else {}
    have = {}
    for line in open(existing_path, encoding="utf-8"):
        if line.strip():
            have.setdefault(words(line.strip()), line.strip())

    out, skipped_cat, dupes, bad = [], 0, [], 0
    seen = set()
    for r in rows[h + 1:]:
        get = lambda k: r[cols[k]] if k in cols and cols[k] < len(r) else None
        fid = get("id")
        name = (get("name_en") or "").strip()          # English; the German name is only kept for searching
        if not fid or not name:
            continue
        cat = (get("cat_en") or get("cat_de") or "").strip()
        if SKIP.search(cat) or (re.search(r"beverages|getränke", cat, re.I) and not re.search(r"juice|saft|milk|milch", cat, re.I)):
            skipped_cat += 1
            continue
        kcal, p, c, f = (num(get(k)) for k in ("kcal", "protein", "carbs", "fat"))
        fibre = num(get("fibre"))
        salt = num(get("salt"))
        if salt is None and num(get("sodium")) is not None:
            na = num(get("sodium"))
            unit = str(r[cols["sodium"] + 1] if cols["sodium"] + 1 < len(r) else "").lower()
            salt = na * 2.5 / (1 if unit.startswith("g") else 1000)     # sodium in mg (or g) -> salt (NaCl) in g
        if None in (kcal, p, c, f):
            bad += 1
            continue
        name = NOISE.sub("", name).strip()[:120]
        key = words(name)
        de = NOISE.sub("", (get("name_de") or de_by_id.get(str(fid).split(".")[0]) or "")).strip()[:120] or None
        if key in have:
            dupes.append((name, have[key], de, fibre, salt))
            continue
        if key in seen:                      # two entries that read the same once shortened: keep the first
            continue
        seen.add(key)
        out.append((str(fid).split(".")[0], name, de, round(kcal, 1), round(p, 1), round(c, 1), round(f, 1), tags_for(name, cat),
                    None if fibre is None else round(fibre, 1), None if salt is None else round(salt, 2)))

    print("-- Swiss Food Composition Database (FSVO/BLV, naehrwertdaten.ch), sheet:", sheet)
    print("\\set ON_ERROR_STOP on\nbegin;")
    sql = lambda v: "null" if v is None else v
    for fid, name, de, kcal, p, c, f, tags, fibre, salt in out:
        arr = "array[" + ",".join(q(t) for t in tags) + "]::text[]" if tags else "'{}'::text[]"
        print("insert into public.ingredients (name, name_de, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,"
              f" fibre_per_100g, salt_per_100g, dietary_tags, source, source_id) values ({q(name)}, {q(de) if de else 'null'},"
              f" {kcal}, {p}, {c}, {f}, {sql(fibre)}, {sql(salt)}, {arr}, '{SOURCE}', {q(fid)})"
              " on conflict (source, source_id) where source is not null do update set"
              " name_de = excluded.name_de, kcal_per_100g = excluded.kcal_per_100g, protein_per_100g = excluded.protein_per_100g,"
              " carbs_per_100g = excluded.carbs_per_100g, fat_per_100g = excluded.fat_per_100g,"
              " fibre_per_100g = excluded.fibre_per_100g, salt_per_100g = excluded.salt_per_100g;")
    # yours that match a Swiss food: only fill what's empty (German name, fibre, salt); your macros stay
    for mine, theirs, de, fibre, salt in dupes:
        print(f"update public.ingredients set name_de = coalesce(name_de, {q(de) if de else 'null'}),"
              f" fibre_per_100g = coalesce(fibre_per_100g, {sql(None if fibre is None else round(fibre, 1))}),"
              f" salt_per_100g = coalesce(salt_per_100g, {sql(None if salt is None else round(salt, 2))})"
              f" where name = {q(theirs)} and source is distinct from '{SOURCE}';")
    print("commit;")
    print(f"{len(out)} foods to add or update · {skipped_cat} dishes/drinks left out · {len(dupes)} you already have"
          f"{f' · {bad} without full macros' if bad else ''}", file=sys.stderr)
    for mine, theirs, *_ in dupes[:40]:
        print(f"   kept yours: {theirs}   (= {mine})", file=sys.stderr)
    if len(dupes) > 40:
        print(f"   … and {len(dupes) - 40} more", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    main(*sys.argv[1:])
