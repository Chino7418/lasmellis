import { useEffect, useRef, useState } from 'react';
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
 * Usa el lector nativo del navegador (BarcodeDetector) cuando existe
 * —Chrome en Android—, que es rápido y muy preciso. Si no existe
 * —Safari en iPhone, Firefox—, usa ZXing configurado solo con los
 * formatos de productos.
 *
 * En ambos casos se pide la cámara trasera en alta resolución y con
 * enfoque continuo: los códigos de barras (las rayitas) necesitan
 * mucha más definición que un QR.
 */

/** Formatos de códigos de productos (nombres de la API nativa). */
const FORMATOS = [
    'ean_13',
    'ean_8',
    'upc_a',
    'upc_e',
    'code_128',
    'code_39',
    'itf',
    'qr_code',
];

const CADA_MS = 150;

/* Tipos mínimos de la API BarcodeDetector (no está en lib.dom). */
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

/** Devuelve el detector nativo si el navegador lo tiene, o null. */
async function crearDetectorNativo(): Promise<Detector | null> {
    const Nativo = (
        window as unknown as { BarcodeDetector?: ConstructorDetector }
    ).BarcodeDetector;

    if (!Nativo) {
        return null;
    }

    try {
        const soportados = await Nativo.getSupportedFormats();
        const formats = FORMATOS.filter((f) => soportados.includes(f));

        return formats.length > 0 ? new Nativo({ formats }) : null;
    } catch {
        return null;
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
    // El video se guarda en estado (no en un ref) porque el Portal del
    // Dialog lo monta un render después de abrirse: así el efecto se
    // vuelve a ejecutar cuando el <video> efectivamente existe.
    const [video, setVideo] = useState<HTMLVideoElement | null>(null);
    const onDetectadoRef = useRef(onDetectado);
    const [errorCamara, setErrorCamara] = useState<string | null>(null);

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
        let detenerZxing: (() => void) | undefined;

        setErrorCamara(null);

        const detectado = (codigo: string) => {
            if (cancelado) {
                return;
            }

            cancelado = true;
            navigator.vibrate?.(80);
            onDetectadoRef.current(codigo.trim());
        };

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

            const nativo = await crearDetectorNativo();

            if (cancelado) {
                return;
            }

            if (nativo) {
                const buscar = async () => {
                    if (cancelado) {
                        return;
                    }

                    try {
                        const [codigo] = await nativo.detect(video);

                        if (codigo?.rawValue) {
                            detectado(codigo.rawValue);

                            return;
                        }
                    } catch {
                        // Cuadro no listo todavía: se reintenta.
                    }

                    temporizador = setTimeout(buscar, CADA_MS);
                };

                void buscar();

                return;
            }

            // Sin lector nativo: ZXing. Es pesado, así que se descarga
            // recién la primera vez que hace falta.
            const [
                { BrowserMultiFormatReader },
                { BarcodeFormat, DecodeHintType },
            ] = await Promise.all([
                import('@zxing/browser'),
                import('@zxing/library'),
            ]);

            const pistas = new Map();
            pistas.set(DecodeHintType.POSSIBLE_FORMATS, [
                BarcodeFormat.EAN_13,
                BarcodeFormat.EAN_8,
                BarcodeFormat.UPC_A,
                BarcodeFormat.UPC_E,
                BarcodeFormat.CODE_128,
                BarcodeFormat.CODE_39,
                BarcodeFormat.ITF,
                BarcodeFormat.QR_CODE,
            ]);
            pistas.set(DecodeHintType.TRY_HARDER, true);

            const lector = new BrowserMultiFormatReader(pistas, {
                delayBetweenScanAttempts: CADA_MS,
            });

            const controles = await lector.decodeFromStream(
                stream,
                video,
                (resultado) => {
                    if (resultado) {
                        detectado(resultado.getText());
                    }
                },
            );

            detenerZxing = () => controles.stop();

            if (cancelado) {
                detenerZxing();
            }
        };

        iniciar().catch((error: unknown) => {
            console.error('Error de cámara:', error);

            if (!cancelado) {
                setErrorCamara(mensajeDeError(error));
            }
        });

        return () => {
            cancelado = true;
            clearTimeout(temporizador);
            detenerZxing?.();
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
                <div
                    className={
                        errorCamara
                            ? 'hidden'
                            : 'relative overflow-hidden rounded-lg border bg-black'
                    }
                >
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
            </DialogContent>
        </Dialog>
    );
}
