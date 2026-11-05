/*
 * Informes para descargar: PDF (para imprimir o mandar por WhatsApp) y
 * CSV (se abre con Excel). jsPDF se carga recién al descargar, así no
 * agranda la app para quien nunca lo usa.
 */

export type Columna = {
    titulo: string;
    /** Alineación de la columna (los montos van a la derecha). */
    alinear?: 'left' | 'right' | 'center';
    /** Ancho fijo en mm; sin ancho, se reparte el espacio. */
    ancho?: number;
};

type DatosInforme = {
    archivo: string;
    titulo: string;
    subtitulo?: string;
    columnas: Columna[];
    filas: (string | number)[][];
    /** Fila final en negrita (por ejemplo, el total). */
    pie?: (string | number)[];
    /** Hoja acostada, para tablas con muchas columnas. */
    apaisado?: boolean;
};

const CIRUELA: [number, number, number] = [74, 41, 80];
const LILA: [number, number, number] = [243, 237, 246];

const fechaEmision = () =>
    new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date());

export async function descargarPdf(datos: DatosInforme): Promise<void> {
    const [{ jsPDF }, { autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
    ]);

    const doc = new jsPDF({
        orientation: datos.apaisado ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
    });
    const ancho = doc.internal.pageSize.getWidth();

    // ENCABEZADO
    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...CIRUELA);
    doc.text('Las Mellis', 14, 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(40, 30, 45);
    doc.text(datos.titulo, 14, 27);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(110, 95, 115);
    doc.text(`Emitido el ${fechaEmision()}`, ancho - 14, 18, {
        align: 'right',
    });

    if (datos.subtitulo) {
        doc.text(datos.subtitulo, 14, 33);
    }

    // TABLA
    autoTable(doc, {
        startY: datos.subtitulo ? 38 : 33,
        head: [datos.columnas.map((columna) => columna.titulo)],
        body: datos.filas.map((fila) => fila.map(String)),
        foot: datos.pie ? [datos.pie.map(String)] : undefined,
        showFoot: 'lastPage',
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize: 9,
            cellPadding: 2,
            lineColor: [225, 215, 230],
            textColor: [40, 30, 45],
        },
        headStyles: { fillColor: CIRUELA, textColor: 255 },
        footStyles: { fillColor: LILA, textColor: CIRUELA, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [251, 249, 252] },
        columnStyles: Object.fromEntries(
            datos.columnas.map((columna, i) => [
                i,
                {
                    halign: columna.alinear ?? 'left',
                    ...(columna.ancho ? { cellWidth: columna.ancho } : {}),
                },
            ]),
        ),
        // Títulos y total alineados como su columna (no solo el cuerpo).
        didParseCell: (celda) => {
            const alinear = datos.columnas[celda.column.index]?.alinear;

            if (alinear) {
                celda.cell.styles.halign = alinear;
            }
        },
        didDrawPage: () => {
            const alto = doc.internal.pageSize.getHeight();

            doc.setFontSize(8);
            doc.setTextColor(150, 140, 155);
            doc.text(
                `Página ${doc.getCurrentPageInfo().pageNumber}`,
                ancho - 14,
                alto - 8,
                { align: 'right' },
            );
        },
    });

    doc.save(`${datos.archivo}.pdf`);
}

/** CSV con ";" y BOM: así Excel en español lo abre con acentos y columnas. */
export function descargarCsv(
    archivo: string,
    columnas: string[],
    filas: (string | number)[][],
): void {
    const celda = (valor: string | number) => {
        const texto = String(valor);

        return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };

    const contenido = [columnas, ...filas]
        .map((fila) => fila.map(celda).join(';'))
        .join('\r\n');

    const blob = new Blob(['﻿' + contenido], {
        type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');

    enlace.href = url;
    enlace.download = `${archivo}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
}

/** Fecha para el nombre del archivo: 2026-11-05. */
export function fechaArchivo(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date());
}
