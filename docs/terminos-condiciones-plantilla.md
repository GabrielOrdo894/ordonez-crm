# Plantilla de términos y condiciones — Reformas Ordoñez

Copiado de `docs/empresa.md` (§ "Textos T&C por defecto"), que refleja el contenido cargado hoy en
`empresa_config.tc_es` / `tc_fr` desde Configuración → Términos y condiciones del CRM. **Si Gabriel edita el texto
desde el CRM, este archivo queda desactualizado** — ante cualquier duda, el valor real y vigente es el que está en
Supabase (`empresa_config`), no este fichero. Actualízalo a mano si cambia.

El agente creador **solo adapta** esta plantilla (plazos, condiciones de pago según el plan calculado, garantías) —
nunca reescribe ni añade cláusulas legales nuevas. Si un caso no encaja, pregunta a Gabriel.

## Español

```
Art. 1 — Validez: presupuesto válido 30 días naturales desde la fecha de emisión.
Art. 2 — Pago: según el plan acordado. Los retrasos generan intereses al tipo legal vigente.
Art. 3 — Modificaciones: cualquier cambio requiere presupuesto complementario aprobado por escrito.
Art. 4 — Garantías: garantía bienal en equipamiento y decenal en elementos estructurales.
Art. 5 — Residuos: gestionados y trasladados a instalaciones autorizadas a cargo de la empresa.
Art. 6 — Conflictos: mediación previa a la vía judicial. Tribunal del domicilio del prestador.
```

## Français

```
Art. 1 — Validité: devis valable 30 jours calendaires à compter de la date d'émission.
Art. 2 — Paiement: selon le plan convenu. Retard: pénalités légales + 40€ (décret 2012-1115).
Art. 3 — Modifications: tout changement nécessite un devis complémentaire approuvé par écrit.
Art. 4 — Garanties: garantie biennale sur l'équipement et décennale sur les éléments structurels.
Art. 5 — Déchets: gérés et acheminés vers des installations autorisées aux frais de l'entreprise.
Art. 6 — Litiges: médiation préalable à toute action judiciaire. Tribunal du domicile du prestataire.
```

## Placeholder de plan de pago

Los documentos usan `{PLAN_PAGO}` dentro del texto para insertar automáticamente la descripción del plan de pago
calculado (ver `src/lib/terminos.ts`) — el agente creador debe mantener ese marcador si lo ve en la plantilla base.
