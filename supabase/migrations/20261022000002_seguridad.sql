-- =====================================================================
-- LAS MELLIS — SEGURIDAD (Row Level Security)
--
-- Sin Laravel en el medio, el navegador habla directo con la base a
-- través de la API de Supabase. Por eso:
--
--   * Todas las tablas tienen RLS activado.
--   * Solo los usuarios logueados (rol "authenticated") pueden leer y
--     escribir. Un visitante anónimo no ve nada.
--   * Las tablas que eran internas de Laravel (users, sessions, jobs,
--     passkeys, etc.) quedan con RLS y SIN políticas: nadie puede
--     accederlas desde la API.
--
-- Si más adelante hay usuarios con distintos permisos (por ejemplo, un
-- vendedor que no pueda borrar productos), se ajustan estas políticas.
-- =====================================================================

do $$
declare
    tabla text;
begin
    -- Tablas del negocio: acceso completo para usuarios logueados.
    foreach tabla in array array[
        'categorias', 'marcas', 'colores', 'talles', 'productos',
        'variantes_productos', 'precios_productos', 'depositos', 'stock',
        'movimientos_stock', 'clientes', 'ventas', 'detalle_ventas',
        'pagos', 'movimientos_cuenta_corriente'
    ]
    loop
        execute format('alter table %I enable row level security', tabla);
        execute format('drop policy if exists "usuarios logueados" on %I', tabla);
        execute format(
            'create policy "usuarios logueados" on %I
             for all to authenticated
             using (true) with check (true)',
            tabla
        );
        execute format(
            'grant select, insert, update, delete on %I to authenticated',
            tabla
        );
        execute format('revoke all on %I from anon', tabla);
    end loop;

    -- Tablas internas de Laravel (si existen): bloqueadas para la API.
    foreach tabla in array array[
        'users', 'password_reset_tokens', 'sessions', 'cache', 'cache_locks',
        'jobs', 'job_batches', 'failed_jobs', 'passkeys',
        'personal_access_tokens', 'migrations'
    ]
    loop
        if to_regclass(format('public.%I', tabla)) is not null then
            execute format('alter table %I enable row level security', tabla);
            execute format('revoke all on %I from anon, authenticated', tabla);
        end if;
    end loop;
end;
$$;

grant usage, select on all sequences in schema public to authenticated;

grant select on clientes_con_saldo to authenticated;
revoke all on clientes_con_saldo from anon;

-- Las funciones solo las pueden ejecutar usuarios logueados.
revoke execute on function registrar_venta(jsonb) from public, anon;
revoke execute on function pagar_cuenta_corriente(bigint, numeric, text, text) from public, anon;
revoke execute on function dashboard_resumen() from public, anon;

grant execute on function registrar_venta(jsonb) to authenticated;
grant execute on function pagar_cuenta_corriente(bigint, numeric, text, text) to authenticated;
grant execute on function dashboard_resumen() to authenticated;
