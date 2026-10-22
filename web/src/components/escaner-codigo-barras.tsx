import { useEffect, useRef, useState } from 'react';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

/*
 * ESCÁNER DE CÓDIGOS DE BARRAS
 *
 * Usa la API BarcodeDetector: la nativa del navegador cuando existe
 * (Chrome en Android) y, si no (Safari en iPhone, Firefox), la de la
 * librería barcode-detector, que corre ZXing-C++ compilado a
 * WebAssembly y es muy buena leyendo códigos lineales.
 *
 * Se pide la cámara trasera en alta resolución y con enfoque continuo:
 * las rayitas de un código de barras necesitan mucha definición.
 */

/** Formatos de códigos de productos. */
const FORMATOS = [
    'ean_13',
    'ean_8',
    'upc_a',
    'upc_e',
    'code_128',
    'code_39',
    'itf',
    'qr_code',
] as const;

const CADA_MS = 120;

type CodigoDetectado = { rawValue: string };
type Detector = {
    detect: (fuente: HTMLVideoElement) => Promise<CodigoDetectado[]>;
};
type ConstructorDetector = {
    new (opciones?: { formats: string[] }): Detector;
    getSupportedFormats: () => Promise<string[]>;
};

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

async function abrirCamara(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
        },
    });

    // Enfoque continuo: no todos los celulares lo soportan, así que
    // si falla se sigue igual.
    const [pista] = stream.getVideoTracks();

    try {
        await pista.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        });
    } catch {
        // Sin enfoque continuo.
    }

    return stream;
}

/**
 * Devuelve un detector y qué motor usa: el nativo del navegador si
 * existe y soporta los formatos, o el de ZXing-C++ (WebAssembly).
 */
async function crearDetector(): Promise<{ detector: Detector; motor: string }> {
    const Nativo = (
        window as unknown as { BarcodeDetector?: ConstructorDetector }
    ).BarcodeDetector;

    if (Nativo) {
        try {
            const soportados = await Nativo.getSupportedFormats();
            const formats = FORMATOS.filter((f) => soportados.includes(f));

            if (formats.length > 0) {
                return { detector: new Nativo({ formats }), motor: 'nativo' };
            }
        } catch {
            // Se usa el de respaldo.
        }
    }

    // El motor de respaldo pesa ~1 MB: se descarga recién acá. El .wasm
    // se sirve desde la propia app en lugar de un CDN externo.
    const { BarcodeDetector, prepareZXingModule } =
        await import('barcode-detector/ponyfill');

    prepareZXingModule({
        overrides: {
            locateFile: (ruta: string, prefijo: string) =>
                ruta.endsWith('.wasm') ? wasmUrl : prefijo + ruta,
        },
    });

    return {
        detector: new BarcodeDetector({ formats: [...FORMATOS] }),
        motor: 'ZXing-C++',
    };
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
    // El video se guarda en estado (no en un ref) porque el Portal del
    // Dialog lo monta un render después de abrirse: así el efecto se
    // vuelve a ejecutar cuando el <video> efectivamente existe.
    const [video, setVideo] = useState<HTMLVideoElement | null>(null);
    const onDetectadoRef = useRef(onDetectado);
    const [errorCamara, setErrorCamara] = useState<string | null>(null);
    const [diagnostico, setDiagnostico] = useState('');

    useEffect(() => {
        onDetectadoRef.current = onDetectado;
    }, [onDetectado]);

    useEffect(() => {
        if (!abierto || !video) {
            return;
        }

        let cancelado = false;
        let stream: MediaStream | null = null;
        let temporizador: ReturnType<typeof setTimeout> | undefined;

        setErrorCamara(null);
        setDiagnostico('Abriendo la cámara…');

        // Sin mediaDevices no hay cámara posible: pasa en http (no https)
        // y en navegadores internos de apps como Instagram o WhatsApp.
        if (!navigator.mediaDevices?.getUserMedia) {
            setErrorCamara(
                'Este navegador no permite usar la cámara. Abrí la página directamente en Chrome o Safari (si la abriste desde WhatsApp o Instagram, usá "Abrir en el navegador").',
            );

            return;
        }

        const iniciar = async () => {
            stream = await abrirCamara();

            if (cancelado) {
                return;
            }

            video.srcObject = stream;
            await video.play();

            setDiagnostico('Cargando el lector…');

            const { detector, motor } = await crearDetector();

            let intentos = 0;
            let ultimoError = '';

            const buscar = async () => {
                if (cancelado) {
                    return;
                }

                // Hasta que el video no tenga imagen no hay nada que leer.
                if (video.readyState >= 2 && video.videoWidth > 0) {
                    try {
                        const [codigo] = await detector.detect(video);

                        if (cancelado) {
                            return;
                        }

                        if (codigo?.rawValue) {
                            cancelado = true;
                            navigator.vibrate?.(80);
                            onDetectadoRef.current(codigo.rawValue.trim());

                            return;
                        }

                        intentos++;
                    } catch (error) {
                        ultimoError =
                            error instanceof Error
                                ? error.message
                                : String(error);
                    }

                    setDiagnostico(
                        `Lector ${motor} · ${video.videoWidth}×${video.videoHeight} · ${intentos} lecturas${ultimoError ? ` · error: ${ultimoError}` : ''}`,
                    );
                }

                temporizador = setTimeout(buscar, CADA_MS);
            };

            void buscar();
        };

        iniciar().catch((error: unknown) => {
            console.error('Error del escáner:', error);

            if (!cancelado) {
                setErrorCamara(mensajeDeError(error));
            }
        });

        return () => {
            cancelado = true;
            clearTimeout(temporizador);
            stream?.getTracks().forEach((pista) => pista.stop());
            video.srcObject = null;
        };
    }, [abierto, video]);

    return (
        <Dialog open={abierto} onOpenChange={(valor) => !valor && onCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Escanear código de barras</DialogTitle>
                    <DialogDescription>
                        Poné el código dentro del recuadro, que ocupe casi todo
                        el ancho, y mantené el celular quieto unos segundos.
                    </DialogDescription>
                </DialogHeader>

                {errorCamara && (
                    <p className="text-destructive text-sm">{errorCamara}</p>
                )}

                {/* El video está siempre montado (aunque oculto si hubo
                    error) para que al reabrir el escáner se vuelva a
                    intentar sin recargar la página. */}
                <div className={errorCamara ? 'hidden' : 'space-y-2'}>
                    <div className="relative overflow-hidden rounded-lg border bg-black">
                        <video
                            ref={setVideo}
                            className="aspect-video w-full object-cover"
                            muted
                            playsInline
                            autoPlay
                        />

                        {/* Guía para apuntar: recuadro con una línea roja al medio */}
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="relative h-2/5 w-4/5 rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                                <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
                            </div>
                        </div>
                    </div>

                    <p className="text-muted-foreground text-center text-xs">
                        {diagnostico}
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
