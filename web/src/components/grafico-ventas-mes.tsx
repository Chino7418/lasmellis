import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export type VentasMes = {
    /** AAAA-MM */
    mes: string;
    cantidad: number;
    total: number;
};

const ALTO_PX = 200;
export const MESES_EN_CELU = 6;

const nombreMes = new Intl.DateTimeFormat('es-AR', { month: 'short' });
const nombreMesLargo = new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
});
const montoCompacto = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    notation: 'compact',
    maximumFractionDigits: 1,
});
const montoCompleto = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
});

function fechaDe(mes: string): Date {
    const [anio, numero] = mes.split('-').map(Number);

    return new Date(anio, numero - 1, 1);
}

/** Tope "redondo" del eje (1, 2 o 5 × 10^n) para que las líneas caigan en valores legibles. */
function topeRedondo(valor: number): number {
    if (valor <= 0) {
        return 1;
    }

    const potencia = 10 ** Math.floor(Math.log10(valor));

    for (const factor of [1, 2, 2.5, 5, 10]) {
        if (factor * potencia >= valor) {
            return factor * potencia;
        }
    }

    return 10 * potencia;
}

/**
 * Columnas de lo vendido por mes. Una sola serie, así que no lleva
 * leyenda: el título de la tarjeta la nombra. Pasar el mouse o el dedo
 * (o el foco del teclado) sobre un mes muestra el detalle; la tabla
 * oculta deja los datos disponibles para lectores de pantalla.
 */
export function GraficoVentasMes({ datos: todos }: { datos: VentasMes[] }) {
    const [activo, setActivo] = useState<number | null>(null);

    // En el celu, vista compacta: solo los últimos meses.
    const esCelu = useIsMobile();
    const datos = esCelu ? todos.slice(-MESES_EN_CELU) : todos;

    const maximo = Math.max(...datos.map((d) => d.total), 0);
    const tope = topeRedondo(maximo);
    const lineas = [tope, tope / 2, 0];
    const ultimo = datos.length - 1;

    return (
        <div>
            <div className="flex gap-3">
                {/* EJE Y: tres referencias, discretas */}
                <div
                    className="text-muted-foreground relative w-12 shrink-0 text-right text-[11px] tabular-nums sm:w-14"
                    style={{ height: ALTO_PX }}
                    aria-hidden="true"
                >
                    {lineas.map((valor) => (
                        <span
                            key={valor}
                            className="absolute right-0 -translate-y-1/2"
                            style={{ top: `${(1 - valor / tope) * 100}%` }}
                        >
                            {valor === 0 ? '$0' : montoCompacto.format(valor)}
                        </span>
                    ))}
                </div>

                {/* ÁREA DEL GRÁFICO */}
                <div
                    className="relative min-w-0 flex-1"
                    style={{ height: ALTO_PX }}
                >
                    {lineas.map((valor) => (
                        <div
                            key={valor}
                            aria-hidden="true"
                            className={cn(
                                'absolute inset-x-0 border-t',
                                valor === 0
                                    ? 'border-border'
                                    : 'border-border/60 border-dashed',
                            )}
                            style={{ top: `${(1 - valor / tope) * 100}%` }}
                        />
                    ))}

                    <div className="absolute inset-0 flex items-end gap-0.5">
                        {datos.map((dato, i) => {
                            const alto = (dato.total / tope) * 100;
                            const etiqueta = `${nombreMesLargo.format(fechaDe(dato.mes))}: ${montoCompleto.format(dato.total)}, ${dato.cantidad} venta${dato.cantidad !== 1 ? 's' : ''}`;

                            return (
                                // Toda la columna es zona de hover (más grande que la barra).
                                <button
                                    key={dato.mes}
                                    type="button"
                                    className="group relative flex h-full flex-1 items-end justify-center outline-none"
                                    onMouseEnter={() => setActivo(i)}
                                    onMouseLeave={() => setActivo(null)}
                                    onFocus={() => setActivo(i)}
                                    onBlur={() => setActivo(null)}
                                    onClick={() =>
                                        setActivo(activo === i ? null : i)
                                    }
                                    aria-label={etiqueta}
                                >
                                    <span
                                        className={cn(
                                            'bg-chart-1 block w-full max-w-9 rounded-t transition-opacity',
                                            activo !== null &&
                                                activo !== i &&
                                                'opacity-40',
                                            'group-focus-visible:ring-ring group-focus-visible:ring-2',
                                        )}
                                        style={{
                                            height: `${alto}%`,
                                            // Un mes con ventas siempre se ve, aunque sea poco.
                                            minHeight: dato.total > 0 ? 3 : 0,
                                        }}
                                    />

                                    {/* Etiqueta directa solo en el mes actual */}
                                    {i === ultimo &&
                                        dato.total > 0 &&
                                        activo === null && (
                                            <span
                                                className="text-foreground pointer-events-none absolute whitespace-nowrap text-[11px] font-medium tabular-nums"
                                                style={{
                                                    bottom: `calc(${alto}% + 4px)`,
                                                }}
                                            >
                                                {montoCompacto.format(
                                                    dato.total,
                                                )}
                                            </span>
                                        )}

                                    {/* Tooltip */}
                                    {activo === i && (
                                        <span
                                            role="tooltip"
                                            className={cn(
                                                'bg-popover text-popover-foreground pointer-events-none absolute z-10 w-max rounded-md border px-2.5 py-1.5 text-left text-xs shadow-md',
                                                i < 2
                                                    ? 'left-0'
                                                    : i > datos.length - 3
                                                      ? 'right-0'
                                                      : 'left-1/2 -translate-x-1/2',
                                            )}
                                            style={{
                                                bottom: `calc(${Math.min(alto, 85)}% + 8px)`,
                                            }}
                                        >
                                            <span className="block font-medium capitalize">
                                                {nombreMesLargo.format(
                                                    fechaDe(dato.mes),
                                                )}
                                            </span>
                                            <span className="block tabular-nums">
                                                {montoCompleto.format(
                                                    dato.total,
                                                )}
                                            </span>
                                            <span className="text-muted-foreground block">
                                                {dato.cantidad} venta
                                                {dato.cantidad !== 1 ? 's' : ''}
                                            </span>
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* EJE X */}
            <div
                className="ml-[3.75rem] mt-2 flex gap-0.5 sm:ml-[4.25rem]"
                aria-hidden="true"
            >
                {datos.map((dato, i) => {
                    const fecha = fechaDe(dato.mes);
                    const conAnio = i === 0 || fecha.getMonth() === 0;

                    return (
                        <span
                            key={dato.mes}
                            className={cn(
                                'text-muted-foreground min-w-0 flex-1 whitespace-nowrap text-center text-[11px] capitalize',
                                i === ultimo && 'text-foreground font-medium',
                            )}
                        >
                            {nombreMes.format(fecha).replace('.', '')}
                            {conAnio && (
                                <span className="block text-[10px]">
                                    {fecha.getFullYear()}
                                </span>
                            )}
                        </span>
                    );
                })}
            </div>

            {/* Datos en tabla para lectores de pantalla */}
            <table className="sr-only">
                <caption>Ventas por mes, últimos {datos.length} meses</caption>
                <thead>
                    <tr>
                        <th>Mes</th>
                        <th>Total vendido</th>
                        <th>Cantidad de ventas</th>
                    </tr>
                </thead>
                <tbody>
                    {datos.map((dato) => (
                        <tr key={dato.mes}>
                            <td>{nombreMesLargo.format(fechaDe(dato.mes))}</td>
                            <td>{montoCompleto.format(dato.total)}</td>
                            <td>{dato.cantidad}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
