import { describe, expect, it } from 'vitest';
import {
  construirEventoPayload,
  deducirPaisZona,
  dividirNombreCompleto,
  empleadoPorIdioma,
  formatearTelefonoVisual,
  textoFechaHora,
  tipoVisitaDesdeWeb,
} from './visitaWeb';
import {
  dividirNombreCompleto as dividirNombreFrontend,
  formatearTelefonoVisual as formatearTelefonoFrontend,
} from '../../../src/modules/clientes/types';

describe('visita reservada desde la web', () => {
  it('país y zona: dirección de Places primero, luego municipio, luego idioma', () => {
    expect(deducirPaisZona({ municipio: 'Irún', ciudad: '', paisDireccion: '', idioma: 'es' })).toEqual({ pais: 'España', zona: 'Irún' });
    expect(deducirPaisZona({ municipio: 'Donostia', ciudad: '', paisDireccion: '', idioma: 'es' })).toEqual({ pais: 'España', zona: 'Donostia/San Sebastián' });
    expect(deducirPaisZona({ municipio: 'Errenteria', ciudad: '', paisDireccion: '', idioma: 'es' })).toEqual({ pais: 'España', zona: 'Rentería' });
    expect(deducirPaisZona({ municipio: 'Hendaya', ciudad: '', paisDireccion: '', idioma: 'fr' })).toEqual({ pais: 'Francia', zona: 'Hendaye' });
    expect(deducirPaisZona({ municipio: 'Bidart', ciudad: '', paisDireccion: '', idioma: 'fr' })).toEqual({ pais: 'Francia', zona: 'Autre FR' });
    // Ciudad de Places sin acentos ni barra: casa por inclusión.
    expect(deducirPaisZona({ municipio: 'Otro', ciudad: 'Irun', paisDireccion: 'España', idioma: 'es' })).toEqual({ pais: 'España', zona: 'Irún' });
    expect(deducirPaisZona({ municipio: 'Otro', ciudad: 'Donostia', paisDireccion: 'España', idioma: 'fr' })).toEqual({ pais: 'España', zona: 'Donostia/San Sebastián' });
    // La dirección manda sobre el municipio elegido.
    expect(deducirPaisZona({ municipio: 'Irún', ciudad: 'Hendaye', paisDireccion: 'Francia', idioma: 'es' })).toEqual({ pais: 'Francia', zona: 'Hendaye' });
    // Ciudad desconocida: municipio si es del mismo país, si no «Otro».
    expect(deducirPaisZona({ municipio: 'Urrugne', ciudad: 'Béhobie', paisDireccion: 'Francia', idioma: 'fr' })).toEqual({ pais: 'Francia', zona: 'Urrugne' });
    expect(deducirPaisZona({ municipio: 'Irún', ciudad: 'Anglet', paisDireccion: 'Francia', idioma: 'es' })).toEqual({ pais: 'Francia', zona: 'Autre FR' });
    expect(deducirPaisZona({ municipio: 'Otro', ciudad: '', paisDireccion: '', idioma: 'fr' })).toEqual({ pais: 'Francia', zona: 'Autre FR' });
    expect(deducirPaisZona({ municipio: 'Otro', ciudad: '', paisDireccion: '', idioma: 'es' })).toEqual({ pais: 'España', zona: 'Otro ES' });
    // Variante B: municipio = ciudad de la dirección, a veces sin pais_direccion.
    expect(deducirPaisZona({ municipio: 'Hendaye', ciudad: 'Hendaye', paisDireccion: '', idioma: 'es' })).toEqual({ pais: 'Francia', zona: 'Hendaye' });
    expect(deducirPaisZona({ municipio: 'Irun', ciudad: '', paisDireccion: '', idioma: 'fr' })).toEqual({ pais: 'España', zona: 'Irún' });
    expect(deducirPaisZona({ municipio: 'Anglet', ciudad: 'Anglet', paisDireccion: 'Francia', idioma: 'es' })).toEqual({ pais: 'Francia', zona: 'Autre FR' });
  });

  it('nombre, tipo y empleado', () => {
    for (const n of ['Ana', 'María José García López', '  Jean   Dupont ']) {
      expect(dividirNombreCompleto(n)).toEqual(dividirNombreFrontend(n));
    }
    expect(dividirNombreCompleto('María José García')).toEqual({ nombre: 'María', apellidos: 'José García' });
    expect(tipoVisitaDesdeWeb('Otra reforma')).toBe('Otro');
    expect(tipoVisitaDesdeWeb('Baño')).toBe('Baño');
    expect(empleadoPorIdioma('es')).toBe('Ricardo Ordoñez');
    expect(empleadoPorIdioma('fr')).toBe('Ricardo Ordoñez y Santiago');
  });

  it('teléfono igual que en el frontend', () => {
    for (const t of ['+34 659884706', '+33 687524012', '+33 0687524012', '0687524012', '659884706', '+41 79 123 45 67', '']) {
      expect(formatearTelefonoVisual(t)).toBe(formatearTelefonoFrontend(t));
    }
    expect(formatearTelefonoVisual('+34 659884706')).toBe('+34 659 88 47 06');
  });

  it('texto de la fecha para el aviso', () => {
    expect(textoFechaHora('2026-11-23', '18:00')).toBe('lunes 23 de noviembre, 18:00');
  });

  it('payload del evento de Calendar', () => {
    const p = construirEventoPayload({
      tipo: 'Baño', nombre: 'Jean', apellidos: 'Dupont', telefono: '+33 687524012', email: 'j@d.fr', idioma: 'Français',
      descripcion: null, direccion: '1 Rue X, Hendaye', direccion_extra: '2º', zona: 'Hendaye', pais: 'Francia',
      empleado: 'Ricardo Ordoñez y Santiago', estado: 'Pendiente', fecha_visita: '2026-11-25', hora_visita: '18:00', hora_fin_visita: '19:00',
    });
    expect(p.summary).toBe('Visita Tecnica - Baño (Francés)');
    expect(p.location).toBe('1 Rue X, Hendaye');
    expect(p.description).toContain('Tel: +33 6 87 52 40 12');
    expect(p.description).toContain('Dirección: 1 Rue X, Hendaye — 2º');
    expect(p.start).toEqual({ dateTime: '2026-11-25T18:00:00', timeZone: 'Europe/Paris' });
    expect(p.end).toEqual({ dateTime: '2026-11-25T19:00:00', timeZone: 'Europe/Paris' });
    expect(p.colorId).toBe('5');
    expect(p.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }, { method: 'popup', minutes: 600 }] });
  });
});
