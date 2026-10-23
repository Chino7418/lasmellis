import { ScanLine, Wand2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/campo';
import EscanerCodigoBarras from '@/components/escaner-codigo-barras';
import {
    evitarCierreSiCreando,
    SelectorCatalogo,
} from '@/components/selector-catalogo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generarCodigoInterno, guardarVariante } from '@/lib/api';
import type { ItemCatalogo, TablaCatalogo } from '@/lib/api';
import { dinero } from '@/lib/formato';

export type VarianteEditable = {
    id: number;
    codigo_barras: string;
    costo: string | number;
    activo: boolean;
    color?: ItemCatalogo | null;
    talle?: ItemCatalogo | null;
    precios: { precio: string | number; activo: boolean }[];
    stock: {
        cantidad: string | number;
        stock_minimo: string | number;
        deposito?: ItemCatalogo | null;
    }[];
};

type Formulario = {
    color_id: string;
    talle_id: string;
    codigo_barras: string;
    precio: string;
    costo: string;
    deposito_id: string;
    cantidad: string;
    stock_minimo: string;
    activo: boolean;
};

function stockDe(variante: VarianteEditable | null, depositoId: string) {
    const fila = variante?.stock.find(
        (item) => String(item.deposito?.id) === depositoId,
    );

    return {
        cantidad: fila ? String(Number(fila.cantidad)) : '0',
        stock_minimo: fila ? String(Number(fila.stock_minimo)) : '0',
    };
}

/*
 * El negocio no distingue depósitos: el stock vive en el único que
 * existe (o en el primero, si hubiera más) y no se muestra al usuario.
 */
function formularioInicial(
    variante: VarianteEditable | null,
    depositos: ItemCatalogo[],
): Formulario {
    const depositoId = String(
        variante?.stock[0]?.deposito?.id ?? depositos[0]?.id ?? '',
    );
    const precio = variante?.precios.find((item) => item.activo)?.precio;

    return {
        color_id: variante?.color?.id ? String(variante.color.id) : '',
        talle_id: variante?.talle?.id ? String(variante.talle.id) : '',
        codigo_barras: variante?.codigo_barras ?? '',
        precio: precio !== undefined ? String(Number(precio)) : '',
        costo:
            variante && Number(variante.costo) > 0
                ? String(Number(variante.costo))
                : '',
        deposito_id: depositoId,
        ...stockDe(variante, depositoId),
        activo: variante?.activo ?? true,
    };
}

/**
 * Alta / edición de una variante (color + talle) con su código de
 * barras, precio y stock. Se monta con una key distinta por variante,
 * así el formulario arranca limpio cada vez.
 */
export default function VarianteDialog({
    abierto,
    onCerrar,
    onGuardada,
    producto,
    variante,
    colores,
    talles,
    depositos,
    onCatalogoCreado,
}: {
    abierto: boolean;
    onCerrar: () => void;
    onGuardada: () => void;
    producto: { id: number; nombre: string };
    /** null = variante nueva. */
    variante: VarianteEditable | null;
    colores: ItemCatalogo[];
    talles: ItemCatalogo[];
    depositos: ItemCatalogo[];
    onCatalogoCreado: (tabla: TablaCatalogo, item: ItemCatalogo) => void;
}) {
    const [form, setForm] = useState<Formulario>(() =>
        formularioInicial(variante, depositos),
    );
    const [guardando, setGuardando] = useState(false);
    const [escanerAbierto, setEscanerAbierto] = useState(false);

    // Ganancia por unidad, si están el precio y el costo.
    const ganancia =
        form.precio.trim() !== '' && Number(form.costo) > 0
            ? Number(form.precio) - Number(form.costo)
            : null;

    const cambiar = (cambios: Partial<Formulario>) =>
        setForm((actual) => ({ ...actual, ...cambios }));

    const guardar = async (evento: FormEvent) => {
        evento.preventDefault();

        if (!form.codigo_barras.trim()) {
            toast.error(
                'Falta el código de barras: escanealo o tocá la varita para generar uno.',
            );

            return;
        }

        if (form.precio.trim() === '') {
            toast.error('Falta el precio.');

            return;
        }

        setGuardando(true);

        try {
            await guardarVariante({
                id: variante?.id,
                producto_id: producto.id,
                color_id: form.color_id ? Number(form.color_id) : null,
                talle_id: form.talle_id ? Number(form.talle_id) : null,
                codigo_barras: form.codigo_barras.trim(),
                precio: Number(form.precio),
                costo: Number(form.costo) || 0,
                deposito_id: Number(form.deposito_id),
                cantidad: Number(form.cantidad) || 0,
                stock_minimo: Number(form.stock_minimo) || 0,
                activo: form.activo,
            });

            toast.success(
                variante ? 'Variante actualizada.' : 'Variante agregada.',
            );
            onGuardada();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'No se pudo guardar la variante.',
            );
        } finally {
            setGuardando(false);
        }
    };

    return (
        <>
            <Dialog
                open={abierto}
                onOpenChange={(valor) => !valor && onCerrar()}
            >
                <DialogContent
                    className="sm:max-w-lg"
                    onEscapeKeyDown={evitarCierreSiCreando}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {variante ? 'Editar variante' : 'Nueva variante'}
                        </DialogTitle>
                        <DialogDescription>{producto.nombre}</DialogDescription>
                    </DialogHeader>

                    <form
                        id="form-variante"
                        className="grid gap-4 sm:grid-cols-2"
                        onSubmit={guardar}
                    >
                        <Campo label="Color">
                            <SelectorCatalogo
                                tabla="colores"
                                items={colores}
                                valor={form.color_id}
                                onCambio={(valor) =>
                                    cambiar({ color_id: valor })
                                }
                                onCreado={(item) =>
                                    onCatalogoCreado('colores', item)
                                }
                                opcionVacia="Sin color"
                            />
                        </Campo>

                        <Campo label="Talle">
                            <SelectorCatalogo
                                tabla="talles"
                                items={talles}
                                valor={form.talle_id}
                                onCambio={(valor) =>
                                    cambiar({ talle_id: valor })
                                }
                                onCreado={(item) =>
                                    onCatalogoCreado('talles', item)
                                }
                                opcionVacia="Sin talle"
                            />
                        </Campo>

                        <Campo
                            id="codigo_barras"
                            label="Código de barras"
                            className="sm:col-span-2"
                        >
                            <div className="flex gap-2">
                                <Input
                                    id="codigo_barras"
                                    className="font-mono"
                                    value={form.codigo_barras}
                                    placeholder="Escaneá el código de la etiqueta"
                                    onChange={(evento) =>
                                        cambiar({
                                            codigo_barras: evento.target.value,
                                        })
                                    }
                                    onKeyDown={(evento) => {
                                        // El lector físico manda Enter al final:
                                        // no tiene que guardar el formulario.
                                        if (evento.key === 'Enter') {
                                            evento.preventDefault();
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
                                    onClick={() =>
                                        cambiar({
                                            codigo_barras:
                                                generarCodigoInterno(),
                                        })
                                    }
                                    title="Generar un código (para prendas sin código de barras)"
                                >
                                    <Wand2 />
                                </Button>
                            </div>
                        </Campo>

                        <Campo id="precio" label="Precio de venta">
                            <Input
                                id="precio"
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={form.precio}
                                onChange={(evento) =>
                                    cambiar({ precio: evento.target.value })
                                }
                            />
                        </Campo>

                        <Campo id="costo" label="Costo" opcional>
                            <Input
                                id="costo"
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={form.costo}
                                onChange={(evento) =>
                                    cambiar({ costo: evento.target.value })
                                }
                            />
                            {ganancia !== null && (
                                <p className="text-muted-foreground text-xs">
                                    Ganás {dinero(ganancia)} por unidad
                                    {Number(form.precio) > 0 &&
                                        ` (${Math.round((ganancia / Number(form.precio)) * 100)}%)`}
                                </p>
                            )}
                        </Campo>

                        <Campo id="cantidad" label="Stock">
                            <Input
                                id="cantidad"
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={form.cantidad}
                                onChange={(evento) =>
                                    cambiar({ cantidad: evento.target.value })
                                }
                            />
                        </Campo>

                        <Campo id="stock_minimo" label="Avisar con stock de">
                            <Input
                                id="stock_minimo"
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={form.stock_minimo}
                                onChange={(evento) =>
                                    cambiar({
                                        stock_minimo: evento.target.value,
                                    })
                                }
                            />
                        </Campo>

                        {variante && (
                            <div className="flex items-center gap-2 sm:col-span-2">
                                <Checkbox
                                    id="variante-activa"
                                    checked={form.activo}
                                    onCheckedChange={(valor) =>
                                        cambiar({ activo: valor === true })
                                    }
                                />
                                <Label
                                    htmlFor="variante-activa"
                                    className="font-normal"
                                >
                                    Activa (disponible para vender)
                                </Label>
                            </div>
                        )}
                    </form>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCerrar}
                            disabled={guardando}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            form="form-variante"
                            disabled={guardando}
                        >
                            {guardando ? 'Guardando...' : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <EscanerCodigoBarras
                abierto={escanerAbierto}
                onCerrar={() => setEscanerAbierto(false)}
                onDetectado={(codigo) => {
                    setEscanerAbierto(false);
                    cambiar({ codigo_barras: codigo });
                    toast.success('Código escaneado.');
                }}
            />
        </>
    );
}
