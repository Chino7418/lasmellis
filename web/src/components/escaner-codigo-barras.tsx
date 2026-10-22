import type { IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

/** Traduce los errores de getUserMedia a algo accionable. */
function mensajeDeError(error: unknown): string {
    const nombre = error instanceof Error ? error.name : '';

    switch (nombre) {
        case 'NotAllowedError':
        case 'SecurityError':
            return 'No hay permiso para usar la cámara. Tocá el candado o el ícono de ajustes junto a la dirección de la página, permití la cámara y volvé a intentar.';
        case 'NotFoundError':
        case 'OverconstrainedError':
            return 'No se encontró ninguna cámara en este dispositivo.';
        case 'NotReadableError':
        case 'AbortError':
            return 'La cámara está siendo usada por otra app. Cerrala y volvé a intentar.';
        default:
            return `No se pudo abrir la cámara (${nombre || 'error desconocido'}${error instanceof Error && error.message ? `: ${error.message}` : ''}).`;
    }
}

type Props = {
    abierto: boolean;
    onCerrar: () => void;
    onDetectado: (codigo: string) => void;
};

export default function EscanerCodigoBarras({
    abierto,
    onCerrar,
    onDetectado,
}: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const controlsRef = useRef<IScannerControls | null>(null);
    const onDetectadoRef = useRef(onDetectado);
    const [errorCamara, setErrorCamara] = useState<string | null>(null);

    useEffect(() => {
        onDetectadoRef.current = onDetectado;
    }, [onDetectado]);

    useEffect(() => {
        if (!abierto || !videoRef.current) {
            return;
        }

        let cancelado = false;
        setErrorCamara(null);

        const video = videoRef.current;

        // Sin mediaDevices no hay cámara posible: pasa en http (no https)
        // y en navegadores internos de apps como Instagram o WhatsApp.
        if (!navigator.mediaDevices?.getUserMedia) {
            setErrorCamara(
                'Este navegador no permite usar la cámara. Abrí la página directamente en Chrome o Safari (si la abriste desde WhatsApp o Instagram, usá "Abrir en el navegador").',
            );

            return;
        }

        // La librería del escáner es pesada: se descarga recién la
        // primera vez que se abre la cámara.
        import('@zxing/browser')
            .then(({ BrowserMultiFormatReader }) =>
                new BrowserMultiFormatReader().decodeFromConstraints(
                    // En el celular, la cámara trasera.
                    { video: { facingMode: { ideal: 'environment' } } },
                    video,
                    (resultado, _error, controls) => {
                        controlsRef.current = controls;

                        if (cancelado) {
                            controls.stop();

                            return;
                        }

                        if (resultado) {
                            cancelado = true;
                            controls.stop();
                            onDetectadoRef.current(resultado.getText());
                        }
                    },
                ),
            )
            .catch((error: unknown) => {
                console.error('Error de cámara:', error);

                if (!cancelado) {
                    setErrorCamara(mensajeDeError(error));
                }
            });

        return () => {
            cancelado = true;
            controlsRef.current?.stop();
            controlsRef.current = null;
        };
    }, [abierto]);

    return (
        <Dialog open={abierto} onOpenChange={(valor) => !valor && onCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Escanear código de barras</DialogTitle>
                    <DialogDescription>
                        Apuntá la cámara al código de barras del producto. Se
                        detecta automáticamente.
                    </DialogDescription>
                </DialogHeader>

                {errorCamara && (
                    <p className="text-destructive text-sm">{errorCamara}</p>
                )}

                {/* El video está siempre montado (aunque oculto si hubo
                    error) para que al reabrir el escáner se vuelva a
                    intentar sin recargar la página. */}
                <div
                    className={
                        errorCamara
                            ? 'hidden'
                            : 'overflow-hidden rounded-lg border bg-black'
                    }
                >
                    <video
                        ref={videoRef}
                        className="aspect-video w-full object-cover"
                        muted
                        playsInline
                        autoPlay
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
