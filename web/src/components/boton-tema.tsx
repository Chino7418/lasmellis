import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppearance } from '@/hooks/use-appearance';

/**
 * Alterna entre modo claro y oscuro. Muestra el ícono del modo al que
 * se va a pasar: luna en modo claro, sol en modo oscuro.
 */
export function BotonTema() {
    const { resolvedAppearance, updateAppearance } = useAppearance();
    const oscuro = resolvedAppearance === 'dark';
    const etiqueta = oscuro ? 'Pasar a modo claro' : 'Pasar a modo oscuro';

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => updateAppearance(oscuro ? 'light' : 'dark')}
            title={etiqueta}
            aria-label={etiqueta}
        >
            {oscuro ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
    );
}
