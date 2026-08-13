# Empresa — Reformas Ordoñez

## Datos legales

```
Nombre:         Mario Ricardo Ordoñez Quevedo
Razón social:   Reformas Ordoñez
Forma jurídica: EURL (constituida 2026-06-24, inmatriculada RCS 2026-07-07)
SIREN / RCS:    106 842 925 · R.C.S. Bayonne
TVA Francia:    FR 47106842925
CIF España:     44670089E
Code APE:       4399C
```

> Corregido 2026-08-12 tras verificar contra los estatutos, el extrait Kbis y el registre des
> bénéficiaires effectifs reales (`documentos legales/` en el proyecto, fuera de git): el SIRET/TVA
> que había aquí antes (994 426 286 00013 / FR 26994426286) no coincidía con el SIREN real de la
> sociedad (106 842 925) — ya estaba mal también en `empresa_config` de Supabase, corregido ahí
> también. Falta el SIRET completo de 14 dígitos (SIREN + código NIC del establecimiento) — el
> Kbis solo trae el SIREN de 9 dígitos; consultar el NIC en el avis de situation Sirene (sirene.fr,
> gratuito e instantáneo con el SIREN) o en el certificado de inmatriculation si Gabriel lo tiene.

## Direcciones

```
Francia:  4 Av des Allées 2ème Étage, 64700 Hendaye, France
España:   Calle Estación n5, 5D, 20301 Irún, España
Teléfono: +34 697 29 41 38 · Web: ordonezrenov.com
```

## Zona de operación — frontera Bidasoa

| País    | Zonas cubiertas                                                        |
|---------|------------------------------------------------------------------------|
| España  | Irún · Hondarribia · Donostia/San Sebastián · Rentería · Bera de Bidasoa |
| Francia | Hendaye · Urrugne · Biriatu · Saint-Jean-de-Luz · Bayonne · Biarritz    |

**Límite de zona (Gabriel, 2026-08-02):** el límite real por el lado francés es Biarritz (pasando por Hendaya,
Urrugne, Biriatu); por el lado español, Donostia/San Sebastián. Si llega un cliente con dirección de obra fuera de
estos límites, ver directriz en `docs/directrices-respuesta-clientes.md`.

## Regla fiscal automática

| País    | Tipo de obra       | Impuesto | Base legal              |
|---------|--------------------|----------|-------------------------|
| España  | Obra nueva         | IVA 21%  |                         |
| España  | Reforma (>2 años)  | IVA 10%  | Art. 91 LIVA            |
| Francia | Travaux rénovation | TVA 10%  | Art. 279-0 bis CGI      |
| Francia | Taux normal        | TVA 20%  |                         |

Al seleccionar País en cualquier formulario → mostrar el impuesto automáticamente.

## Usuarios del sistema

| Nombre           | Email (Supabase Auth)         | Rol      |
|------------------|--------------------------------|----------|
| Ricardo Ordoñez  | reformasordonezeus@gmail.com  | admin    |
| Gabriel Ordoñez  | gabrielfernandez894@gmail.com | gestion  |
| Santiago Ordoñez | santioe188@gmail.com          | contable |

Contraseñas gestionadas por cada usuario — no se documentan aquí.

**Admin:** todas las secciones + Dashboard + Configuración.
**Gestión y Contable:** mismas secciones que admin salvo Dashboard y Configuración (sin distinción entre ambos roles por ahora).

Rol y nombre guardados en `user_metadata` (`rol`, `nombre`) al crear el usuario en Supabase Auth.

## Datos pre-rellenados en empresa_config

```json
{
  "razon_social": "Reformas Ordoñez",
  "nombre_titular": "Mario Ricardo Ordoñez Quevedo",
  "siret": "106 842 925",
  "tva_fr": "FR 47106842925",
  "cif_es": "44670089E",
  "dir_fr": "4 Av des Allées 2ème Étage, 64700 Hendaye, France",
  "dir_es": "Calle Estación n5, 5D, 20301 Irún, España",
  "telefono": "+34 697 29 41 38",
  "web": "ordonezrenov.com",
  "email": "",
  "iban": ""
}
```

## Textos T&C por defecto

**Español:**
```
Art. 1 — Validez: presupuesto válido 30 días naturales desde la fecha de emisión.
Art. 2 — Pago: según el plan acordado. Los retrasos generan intereses al tipo legal vigente.
Art. 3 — Modificaciones: cualquier cambio requiere presupuesto complementario aprobado por escrito.
Art. 4 — Garantías: garantía bienal en equipamiento y decenal en elementos estructurales.
Art. 5 — Residuos: gestionados y trasladados a instalaciones autorizadas a cargo de la empresa.
Art. 6 — Conflictos: mediación previa a la vía judicial. Tribunal del domicilio del prestador.
```

**Français:**
```
Art. 1 — Validité: devis valable 30 jours calendaires à compter de la date d'émission.
Art. 2 — Paiement: selon le plan convenu. Retard: pénalités légales + 40€ (décret 2012-1115).
Art. 3 — Modifications: tout changement nécessite un devis complémentaire approuvé par écrit.
Art. 4 — Garanties: garantie biennale sur l'équipement et décennale sur les éléments structurels.
Art. 5 — Déchets: gérés et acheminés vers des installations autorisées aux frais de l'entreprise.
Art. 6 — Litiges: médiation préalable à toute action judiciaire. Tribunal du domicile du prestataire.
```
