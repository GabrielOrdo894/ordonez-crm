import { describe, it, expect } from 'vitest';
import { parseOfx } from './ofx';

const OFX_1X = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260115120000
<TRNAMT>-125.50
<FITID>2026011501
<NAME>ALKAIN MATERIALES
<MEMO>Compra sanitarios
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260118
<TRNAMT>1200,00
<FITID>2026011802
<NAME>TRANSFERENCIA CLIENTE
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

describe('parseOfx', () => {
  it('extrae fecha, importe, fitid y descripción de cada movimiento', () => {
    const movimientos = parseOfx(OFX_1X);
    expect(movimientos).toHaveLength(2);
    expect(movimientos[0]).toEqual({
      fitid: '2026011501',
      fecha: '2026-01-15',
      importe: -125.5,
      descripcion: 'ALKAIN MATERIALES — Compra sanitarios',
    });
  });

  it('acepta coma decimal (formato europeo) en TRNAMT', () => {
    const movimientos = parseOfx(OFX_1X);
    expect(movimientos[1].importe).toBe(1200);
  });

  it('acepta DTPOSTED sin hora (solo 8 dígitos)', () => {
    const movimientos = parseOfx(OFX_1X);
    expect(movimientos[1].fecha).toBe('2026-01-18');
  });

  it('descarta bloques sin fecha o con importe no numérico', () => {
    const roto = `<STMTTRN><DTPOSTED></DTPOSTED><TRNAMT>abc</TRNAMT><FITID>X</FITID></STMTTRN>`;
    expect(parseOfx(roto)).toHaveLength(0);
  });

  it('sin FITID, genera uno propio a partir de fecha+importe+descripción', () => {
    const sinFitid = `<STMTTRN><DTPOSTED>20260201</DTPOSTED><TRNAMT>-10.00</TRNAMT><NAME>VARIOS</NAME></STMTTRN>`;
    const [m] = parseOfx(sinFitid);
    expect(m.fitid).toContain('20260201');
    expect(m.fitid).toContain('-10.00');
  });

  it('sin nombre ni memo, usa "Sin descripción"', () => {
    const sinDescripcion = `<STMTTRN><DTPOSTED>20260201</DTPOSTED><TRNAMT>-10.00</TRNAMT><FITID>Y</FITID></STMTTRN>`;
    const [m] = parseOfx(sinDescripcion);
    expect(m.descripcion).toBe('Sin descripción');
  });

  it('texto sin ningún STMTTRN devuelve lista vacía', () => {
    expect(parseOfx('sin movimientos aquí')).toEqual([]);
  });
});
