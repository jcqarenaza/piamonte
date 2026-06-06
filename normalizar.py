#!/usr/bin/env python3
"""
Normaliza los catálogos de los proveedores (GAMMA, Sekurit, Malateseta) a una
tabla única, agrupa piezas equivalentes y genera los datos del panel.

Uso:
    python normalizar.py [carpeta_proveedores] [carpeta_salida]

Salidas:
    catalogo_unificado.xlsx  - tabla normalizada con fórmulas
    catalogo_agrupado.csv    - + grupo (pieza), posición y modelo/versión
    panel_data.js            - datos compactos para index.html
"""
import sys, os, re, json, warnings
import pandas as pd
warnings.filterwarnings("ignore")
from rapidfuzz import fuzz

INP = sys.argv[1] if len(sys.argv) > 1 else "data/proveedores"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data"
F_GAMMA = os.path.join(INP, "Marzo_2026_GAMMA.xlsx")
F_SEKUR = os.path.join(INP, "Disponible_19_05_Sekurit.xlsx")
F_MALAT = os.path.join(INP, "CATALOGO_ABRIL_Malateseta.xlsx")

def norm(s):
    s = str(s).upper()
    for a, b in [("Á","A"),("É","E"),("Í","I"),("Ó","O"),("Ú","U"),("Ü","U"),("Ñ","N")]:
        s = s.replace(a, b)
    return s.strip()

def norm_txt(s):
    s = norm(s); s = re.sub(r"[^A-Z0-9 ]", " ", s); return re.sub(r"\s+", " ", s).strip()

# ---------- parsers ----------
def parse_gamma():
    g = pd.read_excel(F_GAMMA, sheet_name="Lista General", header=None)
    hdr = next(i for i in range(g.shape[0]) if "CODIGO" in [str(x).strip().upper() for x in g.iloc[i].tolist()[:10]])
    cols = {str(g.iloc[hdr, j]).strip().upper(): j for j in range(g.shape[1]) if pd.notna(g.iloc[hdr, j])}
    cC, cD, cP = cols.get("CODIGO"), cols.get("DESCRIPCIÓN", cols.get("DESCRIPCION")), cols.get("PRECIO")
    cCl, cM = cols.get("CLASIFICACION"), cols.get("MARCA")
    out = []
    for i in range(hdr + 1, g.shape[0]):
        cod, pre = g.iloc[i, cC], g.iloc[i, cP]
        if pd.isna(cod) or pd.isna(pre): continue
        try: pre = float(pre)
        except: continue
        clasif = g.iloc[i, cCl]
        out.append(dict(proveedor="GAMMA", codigo=str(cod).strip(), descripcion=str(g.iloc[i, cD]).strip(),
            marca=str(g.iloc[i, cM]).strip() if pd.notna(g.iloc[i, cM]) else "",
            categoria="Parabrisas" if str(clasif).strip().lower() == "parabrisas" else "Accesorio",
            precio_lista=pre, disponible=""))
    return out

def parse_sekurit():
    s = pd.read_excel(F_SEKUR, sheet_name="LP", header=0)
    s.columns = [str(c).strip() for c in s.columns]
    def col(*names):
        for n in names:
            if n in s.columns: return n
    c_mat, c_desc = col("Material.1", "Material"), col("Descripción", "Descripcion")
    c_marca, c_pre, c_disp = col("Marca"), col("Precios Lista Mayo"), col("Disponible")
    out = []
    for _, r in s.iterrows():
        try: pre = float(r[c_pre])
        except: continue
        if pd.isna(r[c_desc]): continue
        desc = str(r[c_desc]).strip()
        out.append(dict(proveedor="SEKURIT", codigo=str(r[c_mat]).strip() if pd.notna(r[c_mat]) else "",
            descripcion=desc, marca=str(r[c_marca]).strip() if pd.notna(r[c_marca]) else "",
            categoria="Parabrisas" if desc.upper().startswith("PB") else "Accesorio",
            precio_lista=pre, disponible=str(r[c_disp]).strip() if pd.notna(r[c_disp]) else ""))
    return out

def parse_malatesta():
    m = pd.read_excel(F_MALAT, sheet_name="Lista", header=None)
    cur = ""; out = []; code_re = re.compile(r"^[0-9]{4,}[A-Z0-9]+$")
    for i in range(m.shape[0]):
        c1, c2, c5 = m.iloc[i, 1], m.iloc[i, 2], m.iloc[i, 5]
        if pd.notna(c1):
            t = str(c1).strip()
            if re.fullmatch(r"[A-ZÁÉÍÓÚÜÑ /\.\-]+", t) and not any(ch.isdigit() for ch in t) and pd.isna(c5) and pd.isna(c2):
                cur = t; continue
            if code_re.match(t):
                try: pre = float(c5)
                except: continue
                desc = str(c2).strip() if pd.notna(c2) else ""
                out.append(dict(proveedor="MALATESTA", codigo=t, descripcion=desc, marca=cur,
                    categoria="Parabrisas" if desc.upper().startswith("PSAS") else "Accesorio",
                    precio_lista=pre, disponible=""))
    return out

# ---------- posición y modelo/versión ----------
def decode_pos(desc):
    d = re.sub(r"^E-", "", norm(desc))
    if d.startswith("PSAS") or re.match(r"^PB\b", d) or "PARABRISA" in d[:14] or d.startswith("PABR"): return "PARABRISAS"
    if d.startswith("TECHO"): return "TECHO"
    if d.startswith("LTA") or d.startswith("LUNETA") or re.match(r"^LT\b", d): return "LUNETA"
    if re.match(r"^P\.?D\.?D", d) or re.match(r"^PTA\.? ?DD", d): return "PUERTA_DD"
    if re.match(r"^P\.?D\.?I", d) or re.match(r"^PTA\.? ?DI", d): return "PUERTA_DI"
    if re.match(r"^P\.?T\.?D", d) or re.match(r"^PTA\.? ?TD", d): return "PUERTA_TD"
    if re.match(r"^P\.?T\.?I", d) or re.match(r"^PTA\.? ?TI", d): return "PUERTA_TI"
    if re.match(r"^P\.?D\b", d): return "PUERTA_DD"
    if re.match(r"^P\.?I\b", d): return "PUERTA_DI"
    if re.match(r"^C\.?T\.?D", d): return "CUSTODIA_D"
    if re.match(r"^C\.?T\.?I", d): return "CUSTODIA_I"
    if re.match(r"^C\.?D", d) or (d.startswith("CUSTODIA") and ".I" not in d): return "CUSTODIA_D"
    if re.match(r"^C\.?I", d): return "CUSTODIA_I"
    if re.match(r"^A\.?T\.?D", d) or re.match(r"^A\.?D\b", d): return "ALETA_D"
    if re.match(r"^A\.?T\.?I", d) or re.match(r"^A\.?I\b", d): return "ALETA_I"
    if d.startswith("ALETA"): return "ALETA_D"
    if re.match(r"^V\.?D", d) or d.startswith("VENTANILLA"): return "VENTANA_D"
    if re.match(r"^V\.?I", d): return "VENTANA_I"
    return "OTRO"

POS_PREFIX = re.compile(r"^(E-)?(PSAS|PB|PARABRISA\w*|PABR|LTA\.?TER\.?|LTA|LUNETA|LT|TECHO|P\.?[DT]\.?[DI]|P\.?[DI]|PTA\.? ?[DT][DI]|PTA|C\.?[DTI]\.?[A-Z]*|A\.?[DTI]?\.?[DI]?|ALETA|V\.?[DI]|VENTANILLA|VENTILETE|FIJO)[\.\s]*", re.I)
SERIES = {"SERIE", "CLASE", "CLASS"}
YEAR = re.compile(r"(?:19|20)\d{2}|\b\d{2}(?:[-/]\d{2})?\b")

def model_version(desc, marca):
    d = norm(desc); mk = norm(marca)
    rest = d.split(mk, 1)[1] if (mk and mk in d) else POS_PREFIX.sub("", d, count=1)
    rest = rest.strip(" .-")
    toks = re.findall(r"[A-Z0-9]+", rest)
    if not toks: return ""
    name = toks[0]; start = 1
    if name in SERIES and len(toks) > 1:
        name = name + " " + toks[1]; start = 2
    yr = ""
    for mt in YEAR.finditer(rest):
        tok = mt.group(); base = re.split(r"[-/]", tok)[0]
        if base == name or base in name.split(): continue
        if len(base) == 4: yr = base[2:]; break
        if len(base) == 2 and (int(base) >= 80 or int(base) <= 35): yr = tok.replace("/", "-"); break
    return (name + (" " + yr if yr else "")).strip()

# ---------- ejecutar ----------
def main():
    rows = parse_gamma() + parse_sekurit() + parse_malatesta()
    df = pd.DataFrame(rows)
    df["precio_lista"] = pd.to_numeric(df["precio_lista"], errors="coerce").fillna(0)
    df["desc_norm"] = df["descripcion"].map(norm_txt)
    df["codigo_u"] = df["codigo"].astype(str).str.upper().str.strip()
    df["pos"] = df["descripcion"].map(decode_pos)
    df["modelk"] = [model_version(d, m) for d, m in zip(df["descripcion"], df["marca"])]

    # union-find conservador: código exacto + descripción idéntica
    parent = list(range(len(df)))
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: parent[ra] = rb
    by = {}
    for i, c in enumerate(df["codigo_u"]):
        if len(c) >= 5 and c.lower() not in ("nan", "producto nuevo", ""): by.setdefault(c, []).append(i)
    for idx in by.values():
        for j in idx[1:]: union(idx[0], j)
    by = {}
    for i, d_ in enumerate(df["desc_norm"]):
        if d_: by.setdefault(d_, []).append(i)
    for idx in by.values():
        for j in idx[1:]: union(idx[0], j)
    df["grupo"] = [find(i) for i in range(len(df))]
    gmap = {g: k + 1 for k, g in enumerate(sorted(df["grupo"].unique()))}
    df["grupo"] = df["grupo"].map(gmap)

    # sugerencias fuzzy (no aplicadas) para el panel de equivalencias
    df["marca_u"] = df["marca"].str.upper().str.strip()
    def nums(d): return tuple(sorted(re.findall(r"\d+", d)))
    reps = df.groupby("grupo").agg(descn=("desc_norm","first"), marca=("marca_u","first"),
                                   cat=("categoria","first"), pos=("pos","first")).reset_index()
    reps["nums"] = reps["descn"].map(nums)
    blocks = {}
    # bloque por (marca, POSICION EXACTA): así nunca cruza puerta der con izq, ni delantera con trasera
    for _, r in reps.iterrows(): blocks.setdefault((r["marca"], r["pos"]), []).append(r)
    sug = []
    for items in blocks.values():
        n = len(items)
        if n < 2 or n > 800: continue
        for a in range(n):
            for b in range(a + 1, n):
                ra, rb = items[a], items[b]
                if ra["nums"] != rb["nums"]: continue
                sc = int(fuzz.token_sort_ratio(ra["descn"], rb["descn"]))
                if sc >= 90: sug.append([int(ra["grupo"]), int(rb["grupo"]), sc])
    sug.sort(key=lambda x: -x[2]); sug = sug[:400]

    os.makedirs(OUT, exist_ok=True)
    df.drop(columns=["codigo_u","marca_u"]).to_csv(os.path.join(OUT, "catalogo_agrupado.csv"), index=False)

    # panel_data.js
    ps = {"GAMMA": "G", "SEKURIT": "S", "MALATESTA": "M"}
    def dcode(x):
        x = str(x).upper(); return "SI" if x in ("SI","SÍ") else "NO" if x == "NO" else "MIN" if "MIN" in x else ""
    data_rows = [[ps[r["proveedor"]], str(r["codigo"]), r["descripcion"], r["marca"],
        "P" if r["categoria"] == "Parabrisas" else "A",
        round(float(r["precio_lista"]), 0), round(float(r["precio_lista"]), 0),  # cn se recalcula en el panel
        dcode(r["disponible"]), int(r["grupo"]), r["pos"], r["modelk"]] for _, r in df.iterrows()]
    js = "const DATA=" + json.dumps({"rows": data_rows, "sug": sug}, ensure_ascii=False, separators=(",", ":")) + ";"
    open(os.path.join(OUT, "panel_data.js"), "w", encoding="utf-8").write(js)

    print(f"OK  filas={len(df)}  piezas={df['grupo'].nunique()}  sugerencias={len(sug)}  "
          f"posiciones_ok={round((df['pos']!='OTRO').mean()*100,1)}%")
    return df

if __name__ == "__main__":
    main()
