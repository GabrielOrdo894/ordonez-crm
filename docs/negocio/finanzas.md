# Módulo financiero — referencia

## Tipos de IVA
| Código  | País | %  | Cuándo                                       |
|---------|------|----|----------------------------------------------|
| IVA_21  | ES   | 21 | Obra nueva                                   |
| IVA_10  | ES   | 10 | Reforma edificio >2 años (art. 91 LIVA)      |
| TVA_10  | FR   | 10 | Travaux rénovation (art. 279-0 bis CGI)      |
| TVA_20  | FR   | 20 | Taux normal                                  |
| EXENTO  | —    | 0  | Exento                                       |

## Tipos de servicio (obligatorio en facturas FR)
`Travaux` · `Prestations de services BIC` · `Fournitures` · `Main d'œuvre` · `—`

## Línea de limpieza
`es_incluido: true` → mostrar "Incluido" (ES) / "Inclus" (FR). Sin cifra.

## Plan de pago — presets
50/50 · 40-40-20 · 100% a la firma

## Notas legales en PDF
- ES: "IVA aplicado según normativa vigente"
- FR TVA_10: "TVA sur les travaux de rénovation selon article 279-0 bis du CGI"
- FR factura: "En cas de retard de paiement, indemnité forfaitaire: 40€ (décret n°2012-1115)"

## Asistente IVA Francia — casillas CA3
| Casilla | Qué va aquí                           | Origen en los datos              |
|---------|---------------------------------------|----------------------------------|
| 08      | Base facturas FR TVA 20%              | sum(facturas FR con TVA_20)      |
| 09      | Base facturas FR TVA 10%              | sum(facturas FR con TVA_10)      |
| 16      | TVA cobrada al 20%                    | casilla 08 × 0.20                |
| 17      | TVA cobrada al 10%                    | casilla 09 × 0.10                |
| 18      | Total TVA brute                       | 16 + 17                          |
| 19      | TVA soportada en herramientas/equipo  | sum(gastos FR cuenta 605/681)    |
| 20      | TVA soportada en materiales/servicios | sum(gastos FR resto de cuentas)  |
| 23      | Total TVA déductible                  | 19 + 20                          |
| 25      | Crédit de TVA (si 23 > 18)            | 23 − 18                          |
| 28      | Montant dû (si 18 > 23)               | 18 − 23 (lo que se paga)         |

## Cuentas contables
**España PGC:** 600 · 601 · 604 · 621 · 622 · 623 · 624 · 625 · 628 · 629 · 640 · 642 · 680
**Francia PCG:** 601 · 604 · 611 · 613 · 615 · 616 · 622 · 624 · 625 · 626 · 641 · 645 · 681

Selector cambia automáticamente según el `pais` del gasto.

## Estructura PDF (todos los documentos)
1. Portada corporativa (banda bg-brand-dark + bloque bg-brand en esquina derecha)
2. Contenido: tabla de partidas con jspdf-autotable
3. Totales + plan de pago
4. Términos y condiciones (última página)

Fuente PDF: Helvetica (built-in jsPDF). A4. Márgenes 15mm.
Instalar en Bloque 4: `npm install jspdf jspdf-autotable`
