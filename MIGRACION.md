# Migración a Supabase + React + Vercel

La app nueva está en `web/` (React + Vite + Supabase). La lógica de negocio
está en `supabase/migrations/`. La carpeta de Laravel sigue intacta hasta que
confirmes que todo funciona.

## 1. Base de datos (Supabase)

En el panel de Supabase, abrí **SQL Editor** y ejecutá en orden:

1. `supabase/migrations/20261022000000_esquema.sql`: tablas, triggers y datos iniciales.
2. `supabase/migrations/20261022000001_logica_negocio.sql`: ventas, pagos y dashboard.
3. `supabase/migrations/20261022000002_seguridad.sql`: políticas RLS.

Los tres scripts se pueden volver a correr sin romper nada.

## 2. Usuarios

1. En **Authentication > Sign In / Providers**, desactivá **Allow new users to sign up**.
   Es importante: cualquier usuario logueado puede ver y modificar todos los datos.
2. En **Authentication > Users > Add user**, creá a cada persona que usa la app
   (con **Auto Confirm User** marcado).
3. En **Authentication > URL Configuration**, cargá la URL de Vercel en **Site URL**
   y agregá `https://TU-APP.vercel.app/restablecer-clave` en **Redirect URLs**
   (para el "¿Olvidaste tu contraseña?").

## 3. Correr en tu compu

```
cd web
copy .env.example .env    (y completá los dos valores: Project Settings > API)
npm install
npm run dev
```

## 4. Publicar en Vercel

1. Subí el proyecto a GitHub.
2. En Vercel: **Add New > Project** y elegí el repo.
3. En **Root Directory** poné `web`.
4. En **Environment Variables** cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
5. Hacé clic en **Deploy**.

## Qué reemplazó a qué

| Laravel                               | Ahora                                         |
| ------------------------------------- | --------------------------------------------- |
| `VentaController@store`               | función SQL `registrar_venta`                 |
| `CuentaCorrienteController@pagar`     | función SQL `pagar_cuenta_corriente`          |
| `DashboardController`                 | función SQL `dashboard_resumen`               |
| `ClienteController@index` (con saldo) | vista `clientes_con_saldo`                    |
| Resto de los controladores            | `web/src/lib/api.ts` (consultas directas)     |
| Login de Fortify                      | Supabase Auth                                 |
| Middleware `auth`                     | `web/src/layouts/app-layout.tsx` + RLS        |
| Inertia                               | React Router                                  |
