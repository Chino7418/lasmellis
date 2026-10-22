import type { IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

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

        // La librería del escáner es pesada: se descarga recién la
        // primera vez que se abre la cámara.
        import('@zxing/browser')
            .then(({ BrowserMultiFormatReader }) =>
                new BrowserMultiFormatReader().decodeFromVideoDevice(
                    undefined,
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
            .catch(() => {
                setErrorCamara(
                    'No se pudo acceder a la cámara. Revisá que le hayas dado permiso al navegador y que estés en una conexión https (o localhost).',
                );
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

                {errorCamara ? (
                    <p className="text-destructive text-sm">{errorCamara}</p>
                ) : (
                    <div className="overflow-hidden rounded-lg border bg-black">
                        <video
                            ref={videoRef}
                            className="aspect-video w-full object-cover"
                            muted
                            playsInline
                        />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
