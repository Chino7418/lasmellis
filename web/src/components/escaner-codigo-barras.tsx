import { Flashlight, SwitchCamera } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { Button } from '@/components/ui/button';
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
 * Lo que más influye en que lea es que la imagen esté NÍTIDA. Por eso:
 * - se pide alta resolución y enfoque continuo;
 * - se puede cambiar de cámara (en celulares con varias cámaras
 *   traseras el navegador suele elegir la gran angular, que no enfoca
 *   de cerca);
 * - se aplica zoom 2x cuando el celular lo permite, para poder alejar
 *   el celular del código y que la cámara enfoque;
 * - se puede prender la linterna.
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
const ZOOM_INICIAL = 2;
const CLAVE_CAMARA = 'escaner-camara';

type CodigoDetectado = { rawValue: string };
type Detector = {
    detect: (fuente: HTMLVideoElement) => Promise<CodigoDetectado[]>;
};
type ConstructorDetector = {
    new (opciones?: { formats: string[] }): Detector;
    getSupportedFormats: () => Promise<string[]>;
};

/* Capacidades de cámara que no están en los tipos de TypeScript. */
type Capacidades = MediaTrackCapabilities & {
    zoom?: { min: number; max: number; step?: number };
    torch?: boolean;
    focusMode?: string[];
};
type Ajustes = MediaTrackConstraintSet & { zoom?: number; torch?: boolean };

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

async function abrirCamara(deviceId: string | null): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            ...(deviceId
                ? { deviceId: { exact: deviceId } }
                : { facingMode: { ideal: 'environment' } }),
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
 * Crea el detector una sola vez por sesión: el nativo del navegador si
 * existe y soporta los formatos, o el de ZXing-C++ (WebAssembly).
 */
let detectorCompartido: Promise<{ detector: Detector; motor: string }> | null =
    null;

function obtenerDetector() {
    detectorCompartido ??= crearDetector();

    return detectorCompartido;
}

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
    const pistaRef = useRef<MediaStreamTrack | null>(null);

    const [errorCamara, setErrorCamara] = useState<string | null>(null);
    const [diagnostico, setDiagnostico] = useState('');

    // null = la cámara trasera que elija el navegador. Se recuerda la
    // última elegida en este dispositivo.
    const [deviceId, setDeviceIdEstado] = useState<string | null>(() => {
        try {
            return localStorage.getItem(CLAVE_CAMARA);
        } catch {
            return null;
        }
    });

    const setDeviceId = (id: string | null) => {
        setDeviceIdEstado(id);

        try {
            if (id) {
                localStorage.setItem(CLAVE_CAMARA, id);
            } else {
                localStorage.removeItem(CLAVE_CAMARA);
            }
        } catch {
            // Sin almacenamiento: solo dura mientras la página esté abierta.
        }
    };
    const [camaras, setCamaras] = useState<MediaDeviceInfo[]>([]);
    const [camaraActual, setCamaraActual] = useState('');

    const [zoomRango, setZoomRango] = useState<Capacidades['zoom'] | null>(
        null,
    );
    const [zoom, setZoom] = useState(1);
    const [tieneLinterna, setTieneLinterna] = useState(false);
    const [linterna, setLinterna] = useState(false);

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
        setLinterna(false);

        // Sin mediaDevices no hay cámara posible: pasa en http (no https)
        // y en navegadores internos de apps como Instagram o WhatsApp.
        if (!navigator.mediaDevices?.getUserMedia) {
            setErrorCamara(
                'Este navegador no permite usar la cámara. Abrí la página directamente en Chrome o Safari (si la abriste desde WhatsApp o Instagram, usá "Abrir en el navegador").',
            );

            return;
        }

        const iniciar = async () => {
            stream = await abrirCamara(deviceId);

            if (cancelado) {
                return;
            }

            const [pista] = stream.getVideoTracks();
            pistaRef.current = pista;

            video.srcObject = stream;
            await video.play();

            // Las etiquetas de las cámaras recién se conocen después de
            // dar permiso.
            const dispositivos =
                await navigator.mediaDevices.enumerateDevices();
            setCamaras(dispositivos.filter((d) => d.kind === 'videoinput'));
            setCamaraActual(pista.getSettings().deviceId ?? '');

            // Zoom y linterna, si el celular los soporta.
            const capacidades = (pista.getCapabilities?.() ??
                {}) as Capacidades;
            const rango =
                capacidades.zoom && capacidades.zoom.max > capacidades.zoom.min
                    ? capacidades.zoom
                    : null;

            setZoomRango(rango);
            setTieneLinterna(capacidades.torch === true);

            if (rango) {
                const inicial = Math.min(
                    rango.max,
                    Math.max(rango.min, ZOOM_INICIAL),
                );

                try {
                    await pista.applyConstraints({
                        advanced: [{ zoom: inicial } as Ajustes],
                    });
                    setZoom(inicial);
                } catch {
                    setZoom(rango.min);
                }
            }

            const enfoque = capacidades.focusMode?.includes('continuous')
                ? 'enfoque automático'
                : 'sin enfoque automático';

            setDiagnostico('Cargando el lector…');

            const { detector, motor } = await obtenerDetector();

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
                        [
                            `Lector ${motor}`,
                            `${video.videoWidth}×${video.videoHeight}`,
                            pista.label || 'cámara',
                            enfoque,
                            `${intentos} lecturas`,
                            ultimoError && `error: ${ultimoError}`,
                        ]
                            .filter(Boolean)
                            .join(' · '),
                    );
                }

                temporizador = setTimeout(buscar, CADA_MS);
            };

            void buscar();
        };

        iniciar().catch((error: unknown) => {
            console.error('Error del escáner:', error);

            if (cancelado) {
                return;
            }

            // La cámara recordada ya no existe: se vuelve a la predeterminada.
            const nombre = error instanceof Error ? error.name : '';

            if (
                deviceId &&
                (nombre === 'OverconstrainedError' ||
                    nombre === 'NotFoundError')
            ) {
                setDeviceId(null);

                return;
            }

            setErrorCamara(mensajeDeError(error));
        });

        return () => {
            cancelado = true;
            clearTimeout(temporizador);
            stream?.getTracks().forEach((pista) => pista.stop());
            pistaRef.current = null;
            video.srcObject = null;
        };
    }, [abierto, video, deviceId]);

    const cambiarCamara = () => {
        if (camaras.length < 2) {
            return;
        }

        const actual = camaras.findIndex((c) => c.deviceId === camaraActual);
        setDeviceId(camaras[(actual + 1) % camaras.length].deviceId);
    };

    const cambiarZoom = (valor: number) => {
        setZoom(valor);
        void pistaRef.current
            ?.applyConstraints({ advanced: [{ zoom: valor } as Ajustes] })
            .catch(() => undefined);
    };

    const alternarLinterna = () => {
        const encendida = !linterna;

        setLinterna(encendida);
        void pistaRef.current
            ?.applyConstraints({ advanced: [{ torch: encendida } as Ajustes] })
            .catch(() => setLinterna(false));
    };

    const numeroCamara =
        camaras.findIndex((c) => c.deviceId === camaraActual) + 1;

    return (
        <Dialog open={abierto} onOpenChange={(valor) => !valor && onCerrar()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Escanear código de barras</DialogTitle>
                    <DialogDescription>
                        Poné el código dentro del recuadro, a unos 15–20 cm, y
                        mantené el celular quieto. Si se ve borroso, probá otra
                        cámara.
                    </DialogDescription>
                </DialogHeader>

                {errorCamara && (
                    <p className="text-destructive text-sm">{errorCamara}</p>
                )}

                {/* El video está siempre montado (aunque oculto si hubo
                    error) para que al reabrir el escáner se vuelva a
                    intentar sin recargar la página. */}
                <div className={errorCamara ? 'hidden' : 'space-y-3'}>
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

                    {/* CONTROLES DE CÁMARA */}
                    <div className="flex flex-wrap items-center gap-2">
                        {camaras.length > 1 && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={cambiarCamara}
                            >
                                <SwitchCamera />
                                Cámara {numeroCamara || 1} de {camaras.length}
                            </Button>
                        )}

                        {tieneLinterna && (
                            <Button
                                type="button"
                                variant={linterna ? 'default' : 'outline'}
                                size="sm"
                                onClick={alternarLinterna}
                            >
                                <Flashlight />
                                Linterna
                            </Button>
                        )}

                        {zoomRango && (
                            <label className="flex min-w-40 flex-1 items-center gap-2 text-sm">
                                <span className="text-muted-foreground shrink-0">
                                    Zoom {zoom.toFixed(1)}x
                                </span>
                                <input
                                    type="range"
                                    className="accent-primary w-full"
                                    min={zoomRango.min}
                                    max={zoomRango.max}
                                    step={zoomRango.step || 0.1}
                                    value={zoom}
                                    onChange={(evento) =>
                                        cambiarZoom(Number(evento.target.value))
                                    }
                                />
                            </label>
                        )}
                    </div>

                    <p className="text-muted-foreground text-center text-xs">
                        {diagnostico}
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
