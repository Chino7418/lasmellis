import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/campo';
import { nombreVariante } from '@/components/campo-codigo-barras';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { sumarStock } from '@/lib/api';
import type { VarianteConCodigo } from '@/lib/api';
import { cantidad as formatoCantidad } from '@/lib/formato';

/**
 * Llegó mercadería de algo que ya está cargado: cuántas unidades, y si
 * cambió, el costo y el precio. Si el código lo comparten varios
 * colores, primero se elige cuál.
 */
export default function SumarStockDialog({
    titulo,
    variantes,
    varianteInicial,
    onCerrar,
    onListo,
}: {
    titulo: string;
    variantes: VarianteConCodigo[];
    varianteInicial?: number;
    onCerrar: () => void;
    onListo: () => void;
}) {
    const [varianteId, setVarianteId] = useState(
        String(
            varianteInicial ?? (variantes.length === 1 ? variantes[0].id : ''),
        ),
    );
    const variante = variantes.find((item) => String(item.id) === varianteId);

    const [unidades, setUnidades] = useState('');
    const [costo, setCosto] = useState(
        variante && variante.costo > 0 ? String(variante.costo) : '',
    );
    const [precio, setPrecio] = useState(
        variante?.precio != null ? String(variante.precio) : '',
    );
    const [guardando, setGuardando] = useState(false);

    const elegir = (id: string) => {
        const elegida = variantes.find((item) => String(item.id) === id);

        setVarianteId(id);
        setCosto(elegida && elegida.costo > 0 ? String(elegida.costo) : '');
        setPrecio(elegida?.precio != null ? String(elegida.precio) : '');
    };

    const guardar = async (evento: FormEvent) => {
        evento.preventDefault();

        if (!variante) {
            toast.error('Elegí el color o talle que llegó.');

            return;
        }

        const cantidad = Number(unidades);

        if (!Number.isInteger(cantidad) || cantidad <= 0) {
            toast.error('Ingresá cuántas unidades llegaron.');

            return;
        }

        // Solo se mandan si cambiaron (así no se ensucia el historial).
        const costoNuevo =
            costo.trim() !== '' && Number(costo) !== variante.costo
                ? Number(costo)
                : null;
        const precioNuevo =
            precio.trim() !== '' && Number(precio) !== variante.precio
                ? Number(precio)
                : null;

        setGuardando(true);

        try {
            const total = await sumarStock(
                variante.id,
                cantidad,
                costoNuevo,
                precioNuevo,
            );

            toast.success(
                `Listo: ${cantidad} sumada${cantidad !== 1 ? 's' : ''}. Ahora hay ${formatoCantidad(total)}.`,
            );
            onListo();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'No se pudo sumar el stock.',
            );
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Sumar stock</DialogTitle>
                    <DialogDescription>{titulo}</DialogDescription>
                </DialogHeader>

                <form
                    id="form-sumar-stock"
                    onSubmit={guardar}
                    className="grid gap-4 sm:grid-cols-2"
                >
                    {variantes.length > 1 ? (
                        <Campo label="Qué llegó" className="sm:col-span-2">
                            <Select value={varianteId} onValueChange={elegir}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Elegí el color o talle" />
                                </SelectTrigger>
                                <SelectContent>
                                    {variantes.map((item) => (
                                        <SelectItem
                                            key={item.id}
                                            value={String(item.id)}
                                        >
                                            {nombreVariante(item) ??
                                                'Sin color ni talle'}
                                            {' · '}
                                            {item.stock > 0
                                                ? `stock ${formatoCantidad(item.stock)}`
                                                : 'sin stock'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Campo>
                    ) : (
                        variante && (
                            <p className="text-muted-foreground text-sm sm:col-span-2">
                                {nombreVariante(variante) ??
                                    'Sin color ni talle'}
                                {' · hoy hay '}
                                {formatoCantidad(variante.stock)}
                            </p>
                        )
                    )}

                    <Campo
                        id="unidades"
                        label="Unidades que llegaron"
                        className="sm:col-span-2"
                    >
                        <Input
                            id="unidades"
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={unidades}
                            onChange={(evento) =>
                                setUnidades(evento.target.value)
                            }
                            autoFocus
                        />
                    </Campo>

                    <Campo id="costo-nuevo" label="Costo" opcional>
                        <Input
                            id="costo-nuevo"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={costo}
                            onChange={(evento) => setCosto(evento.target.value)}
                        />
                    </Campo>

                    <Campo id="precio-nuevo" label="Precio de venta" opcional>
                        <Input
                            id="precio-nuevo"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={precio}
                            onChange={(evento) =>
                                setPrecio(evento.target.value)
                            }
                        />
                    </Campo>

                    <p className="text-muted-foreground -mt-2 text-xs sm:col-span-2">
                        Cambialos solo si esta compra vino a otro precio.
                    </p>
                </form>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onCerrar}>
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        form="form-sumar-stock"
                        disabled={guardando}
                    >
                        {guardando ? 'Guardando...' : 'Sumar stock'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
