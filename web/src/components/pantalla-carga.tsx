/**
 * La misma pantalla "Abriendo…" de index.html (los estilos están ahí),
 * para que no quede en blanco mientras se verifica la sesión.
 */
export function PantallaCarga() {
    return (
        <div className="pantalla-carga" role="status">
            <img src="/images/logo-wordmark.png" alt="Las Mellis" />
            <div className="ruedita" aria-hidden="true" />
            <span>Abriendo…</span>
        </div>
    );
}
