import { CircleAlert, ScanLine, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import EscanerCodigoBarras from '@/components/escaner-codigo-barras';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { codigoBarrasEnUso, generarCodigoInterno } from '@/lib/api';
import type { CodigoEnUso } from '@/lib/api';

/**
 * Código de barras con escáner y generador. Apenas se escanea, se
 * genera o se sale del campo, revisa si ya está cargado en otro
 * producto y lo avisa ahí mismo, antes de completar el resto.
 */
export function CampoCodigoBarras({
    id,
    valor,
    onCambio,
    onEnUso,
    exceptoVarianteId,
    autoFocus,
    onVerProducto,
}: {
    id: string;
    valor: string;
    onCambio: (valor: string) => void;
    /** Avisa al padre el resultado de cada revisión (null = libre). */
    onEnUso?: (enUso: CodigoEnUso | null) => void;
    /** Variante que se edita: su propio código no cuenta como repetido. */
    exceptoVarianteId?: number;
    autoFocus?: boolean;
    /** Si se indica, el aviso ofrece ir al producto que ya lo tiene. */
    onVerProducto?: (enUso: CodigoEnUso) => void;
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
            onEnUso?.(resultado);
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

            {enUso && (
                <div className="border-destructive/40 bg-destructive/5 text-destructive flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm">
                    <CircleAlert className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                        Ya está cargado en{' '}
                        <span className="font-mono">
                            {enUso.codigo_interno}
                        </span>
                        {' · '}
                        {enUso.titulo}
                    </span>
                    {onVerProducto && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onVerProducto(enUso)}
                        >
                            Ver producto
                        </Button>
                    )}
                </div>
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
