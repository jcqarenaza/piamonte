# Nomenclatura de posiciones de vidrios

El decodificador (`decode_pos` en `normalizar.py`) interpreta el 98,6 % de las
piezas a partir del prefijo de la descripción.

| Código en catálogos | Posición |
|---|---|
| `PSAS` · `E-PSAS` · `PB` | Parabrisas |
| `LTA` · `LTA.TER` · `LUNETA` · `LT` | Luneta (TER = térmica) |
| `P.D.D` · `PTA DD` | Puerta delantera derecha |
| `P.D.I` · `PTA DI` | Puerta delantera izquierda |
| `P.T.D` · `PTA TD` | Puerta trasera derecha |
| `P.T.I` · `PTA TI` | Puerta trasera izquierda |
| `P.D` · `P.I` | Puerta derecha / izquierda (2 puertas → se toman como delanteras) |
| `C.D` · `C.I` · `C.D.M/F` · `C.I.M/F` · `C.T.D/I` | Custodia derecha / izquierda |
| `A.D` · `A.I` · `A.T.D` · `A.T.I` · `ALETA` | Aleta derecha / izquierda |
| `V.D` · `V.I` · `VENTANILLA` | Ventana móvil derecha / izquierda |
| `TECHO` | Techo |

## Convención de letras

- **1ª letra**: `P` puerta · `C` custodia · `A` aleta · `V` ventana · `L` luneta
- **Posición** (en puertas): `D` delantera · `T` trasera
- **Lado**: `D` derecha · `I` izquierda
- **Sufijos**: `M` móvil · `F` fija · `TER` térmica
- **Prefijo `E-`**: se interpreta como origen Europa (no cambia la posición)

## Pendiente de confirmar con el local

- `C` = custodia y `A` = aleta/ventilete (a validar).
- Sufijos `M`/`F`/`T` (móvil / fija / trasera).
- `P.D`/`P.I` mapeados a puertas delanteras en autos de 2 puertas.
