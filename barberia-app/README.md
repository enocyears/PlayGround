# 💈 ALANÍS STUDIO — App de Reservas (React + Tailwind + Supabase)

Responsive/móvil, modo oscuro minimalista. Funciona **sin backend** (localStorage demo) y con **Supabase** si configuras las variables.

## Estructura
```
barberia-app/
├── supabase/schema.sql        # tablas + trigger anti-solape + RLS + seed
├── .env.example               # VITE_SUPABASE_*, VITE_ADMIN_*, VITE_BARBER_WHATSAPP
├── src/
│   ├── lib/
│   │   ├── availability.js    # cálculo de slots libres (núcleo)
│   │   ├── store.js           # adapter Supabase ↔ localStorage + auth admin
│   │   ├── supabaseClient.js  # cliente Supabase opcional
│   │   └── whatsapp.js        # mensaje formateado wa.me
│   ├── App.jsx                # flujo cliente (4 pasos) + panel admin
│   ├── main.jsx / index.css
└── index.html
```

## Uso
```bash
cd barberia-app
cp .env.example .env   # edita credenciales
npm install
npm run dev            # http://localhost:5173
```
Admin demo: `barbero@midominio.com` / `CambiaEstaClave123` (o lo que pongas en `.env`).

## Supabase
1. Crea proyecto → SQL Editor → pega `supabase/schema.sql` → Run.
2. Auth → crea usuario barbero → en User Metadata pon `{"role":"admin"}`.
3. Copia URL + anon key al `.env` y reinicia.

## Reglas de negocio
- Cliente: solo lectura de servicios/horarios + INSERT de citas (RLS). Sin login, solo nombre + WhatsApp.
- Admin: ruta `/admin` (pestaña Admin) con login. CRUD citas/servicios/horarios/bloqueos.
