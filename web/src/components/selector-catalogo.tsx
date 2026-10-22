import { Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { crearItemCatalogo } from '@/lib/api';
import type { ItemCatalogo, TablaCatalogo } from '@/lib/api';

/** Valor interno de la opción "sin color / sin talle" (Radix no admite ''). */
const NINGUNO = '__ninguno__';

/**
 * Para usar en el onEscapeKeyDown de un DialogContent: si el foco está
 * en el campo de una opción nueva, Escape cancela solo eso y no cierra
 * la ventana entera.
 */
export function evitarCierreSiCreando(evento: KeyboardEvent) {
    if (
        document.activeElement instanceof HTMLElement &&
        document.activeElement.dataset.catalogoNuevo !== undefined
    ) {
        evento.preventDefault();
    }
}

/**
 * Selector de marca / color / talle con un botón "+" para agregar una
 * opción nueva sin salir del formulario. La nueva queda seleccionada.
 */
export function SelectorCatalogo({
    tabla,
    items,
    valor,
    onCambio,
    onCreado,
    opcionVacia,
    placeholder = 'Seleccionar',
}: {
    tabla: TablaCatalogo;
    items: ItemCatalogo[];
    /** id seleccionado como texto, o '' si no hay. */
    valor: string;
    onCambio: (valor: string) => void;
    /** Avisa al padre para que agregue el item a su lista. */
    onCreado: (item: ItemCatalogo) => void;
    /** Si se indica, aparece una opción para no elegir nada. */
    opcionVacia?: string;
    placeholder?: string;
}) {
    // null = selector normal; texto = escribiendo una opción nueva.
    const [nuevo, setNuevo] = useState<string | null>(null);
    const [creando, setCreando] = useState(false);

    const agregar = async () => {
        if (creando || nuevo === null) {
            return;
        }

        setCreando(true);

        try {
            const { item, yaExistia } = await crearItemCatalogo(tabla, nuevo);

            if (!yaExistia) {
                onCreado(item);
            }

            onCambio(String(item.id));
            setNuevo(null);
            toast.success(
                yaExistia
                    ? `"${item.nombre}" ya existía: quedó seleccionado.`
                    : `"${item.nombre}" agregado.`,
            );
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'No se pudo agregar.',
            );
        } finally {
            setCreando(false);
        }
    };

    if (nuevo !== null) {
        return (
            <div className="flex gap-2">
                <Input
                    autoFocus
                    data-catalogo-nuevo
                    value={nuevo}
                    placeholder="Nombre"
                    onChange={(evento) => setNuevo(evento.target.value)}
                    onKeyDown={(evento) => {
                        // Enter agrega (sin enviar el formulario); Escape cancela.
                        if (evento.key === 'Enter') {
                            evento.preventDefault();
                            void agregar();
                        }

                        if (evento.key === 'Escape') {
                            evento.preventDefault();
                            setNuevo(null);
                        }
                    }}
                    disabled={creando}
                />
                <Button
                    type="button"
                    size="icon"
                    className="shrink-0"
                    onClick={() => void agregar()}
                    disabled={creando}
                    title="Guardar"
                >
                    <Check />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setNuevo(null)}
                    disabled={creando}
                    title="Cancelar"
                >
                    <X />
                </Button>
            </div>
        );
    }

    return (
        <div className="flex gap-2">
            <Select
                value={valor || (opcionVacia ? NINGUNO : '')}
                onValueChange={(elegido) =>
                    onCambio(elegido === NINGUNO ? '' : elegido)
                }
            >
                <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {opcionVacia && (
                        <SelectItem value={NINGUNO}>{opcionVacia}</SelectItem>
                    )}
                    {items.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                            {item.nombre}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => setNuevo('')}
                title="Agregar uno nuevo"
            >
                <Plus />
            </Button>
        </div>
    );
}
