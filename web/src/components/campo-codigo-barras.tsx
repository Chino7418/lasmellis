import { CircleAlert, Info, ScanLine, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import EscanerCodigoBarras from '@/components/escaner-codigo-barras';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { codigoBarrasEnUso, generarCodigoInterno } from '@/lib/api';
import type { CodigoEnUso } from '@/lib/api';

/** "Negro / 95", o null si no tiene color ni talle. */
export function nombreVariante(variante: {
    color: string | null;
    talle: string | null;
}): string | null {
    return [variante.color, variante.talle].filter(Boolean).join(' / ') || null;
}

/**
 * Código de barras con escáner y generador. Apenas se escanea, se
 * genera o se sale del campo, revisa si ya está cargado y lo avisa ahí
 * mismo, antes de completar el resto:
 *
 *  - Si lo usa otro color o talle de `productoId` (el producto que se
 *    edita), es válido: algunas marcas usan un código para todos los
 *    colores. Se muestra como nota.
 *  - Si se pasa `acciones`, el aviso ofrece qué hacer (sumar stock,
 *    agregar otro color...) en vez de mostrarse como error.
 *  - Si no, es un error: el código es de otro producto.
 */
export function CampoCodigoBarras({
    id,
    valor,
    onCambio,
    onEnUso,
    exceptoVarianteId,
    autoFocus,
    productoId,
    acciones,
}: {
    id: string;
    valor: string;
    onCambio: (valor: string) => void;
    /** Avisa al padre el resultado de cada revisión (null = libre). */
    onEnUso?: (enUso: CodigoEnUso | null) => void;
    /** Variante que se edita: su propio código no cuenta como repetido. */
    exceptoVarianteId?: number;
    autoFocus?: boolean;
    /** Producto que se edita: otro color suyo con este código vale. */
    productoId?: number;
    /** Botones para ofrecer cuando el código ya está cargado. */
    acciones?: (enUso: CodigoEnUso) => ReactNode;
}) {
    const [enUso, setEnUso] = useState<CodigoEnUso | null>(null);
    const [escanerAbierto, setEscanerAbierto] = useState(false);
    // Último código revisado, para no consultar dos veces el mismo.
    const revisado = useRef<string | null>(null);

    const revisar = async (codigo: string) => {
        const texto = codigo.trim();

        if (!texto || texto === revisado.current) {
            return;
        }

        revisado.current = texto;

        try {
            const resultado = await codigoBarrasEnUso(texto, exceptoVarianteId);

            // Si mientras tanto se cambió el código, esta respuesta ya
            // no corresponde.
            if (revisado.current !== texto) {
                return;
            }

            setEnUso(resultado);
            // Compartido con otro color del mismo producto: no bloquea.
            onEnUso?.(
                resultado && resultado.producto_id === productoId
                    ? null
                    : resultado,
            );
        } catch {
            revisado.current = null;
        }
    };

    const cambiar = (codigo: string, revisarAhora = false) => {
        onCambio(codigo);

        if (enUso) {
            setEnUso(null);
            onEnUso?.(null);
        }

        if (revisarAhora) {
            void revisar(codigo);
        } else {
            revisado.current = null;
        }
    };

    return (
        <>
            <div className="flex gap-2">
                <Input
                    id={id}
                    autoFocus={autoFocus}
                    className="font-mono"
                    value={valor}
                    placeholder="Escaneá el código de la etiqueta"
                    aria-invalid={enUso ? true : undefined}
                    onChange={(evento) => cambiar(evento.target.value)}
                    onBlur={() => void revisar(valor)}
                    onKeyDown={(evento) => {
                        // El lector físico manda Enter al final: revisa
                        // el código en vez de guardar el formulario.
                        if (evento.key === 'Enter') {
                            evento.preventDefault();
                            void revisar(valor);
                        }
                    }}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setEscanerAbierto(true)}
                    title="Escanear con la cámara"
                >
                    <ScanLine />
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => cambiar(generarCodigoInterno(), true)}
                    title="Generar un código (para prendas sin código de barras)"
                >
                    <Wand2 />
                </Button>
            </div>

            {enUso && enUso.producto_id === productoId ? (
                <p className="text-muted-foreground flex items-start gap-2 text-xs">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                        Este código también lo usa{' '}
                        {enUso.variantes
                            .map(
                                (item) =>
                                    nombreVariante(item) ?? 'otra variante',
                            )
                            .join(', ')}{' '}
                        de este producto. Al vender, la app va a preguntar cuál
                        es.
                    </span>
                </p>
            ) : enUso && acciones ? (
                <div className="border-primary/25 bg-accent/40 grid gap-3 rounded-lg border p-3 text-sm">
                    <div>
                        <p className="flex items-center gap-2 font-medium">
                            <Info className="text-primary size-4 shrink-0" />
                            Este código ya está cargado
                        </p>
                        <p className="mt-1">{enUso.titulo}</p>
                        <ul className="text-muted-foreground mt-1 text-xs">
                            {enUso.variantes.map((item) => (
                                <li key={item.id}>
                                    {nombreVariante(item) ??
                                        'Sin color ni talle'}
                                    {' · '}
                                    {item.stock > 0
                                        ? `stock ${item.stock}`
                                        : 'sin stock'}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {acciones(enUso)}
                    </div>
                </div>
            ) : (
                enUso && (
                    <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                        <CircleAlert className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                            Ya está cargado en otro producto:{' '}
                            <span className="font-mono">
                                {enUso.codigo_interno}
                            </span>
                            {' · '}
                            {enUso.titulo}
                        </span>
                    </div>
                )
            )}

            <EscanerCodigoBarras
                abierto={escanerAbierto}
                onCerrar={() => setEscanerAbierto(false)}
                onDetectado={(codigo) => {
                    setEscanerAbierto(false);
                    cambiar(codigo, true);
                    toast.success('Código escaneado.');
                }}
            />
        </>
    );
}
